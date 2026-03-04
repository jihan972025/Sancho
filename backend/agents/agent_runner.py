import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Callable, Optional

from ..config import get_config
from ..i18n import LANG_NAMES
from ..llm.registry import get_provider_for_model
from ..skills.loader import build_skill_system_prompt
from ..skills.executor import parse_skill_call, execute_skill_call
from ..scheduler.models import Notification, NotifyApps as SchedulerNotifyApps
from ..scheduler import storage as scheduler_storage
from .agent_models import AgentWorkflow, AgentNodeDef, AgentEdge, AgentLog
from . import agent_storage as storage

logger = logging.getLogger(__name__)

MAX_RECURSION_DEPTH = 5
CHATAPP_IDS = {"whatsapp", "telegram", "matrix", "slack_app", "slack"}


class AgentExecutor:
    """Graph-based agent execution engine supporting branching, loops, fork/join, etc."""

    def __init__(self, agent: AgentWorkflow, provider, model: str, depth: int = 0, language: str = "en"):
        self.agent = agent
        self.provider = provider
        self.model = model
        self.depth = depth
        self.language = language
        self.node_map = {n.id: n for n in agent.nodes}
        self.adj: dict[str, list[tuple[AgentEdge, str]]] = {}
        self.results: dict[str, str] = {}
        self.variables: dict[str, str] = {}
        self.executed: set[str] = set()
        self.status_callback: Optional[Callable] = None
        self._stop_at: set[str] = set()  # Nodes to stop at (e.g. join nodes during fork)

        # Build adjacency list
        for n in agent.nodes:
            self.adj[n.id] = []
        for e in agent.edges:
            if e.source in self.adj:
                self.adj[e.source].append((e, e.target))

        # Pre-identify join node IDs
        self._join_ids = {n.id for n in agent.nodes if (n.nodeType or "service") == "join"}

    async def execute(self) -> str:
        """Find start nodes and execute the graph."""
        start_ids = self._find_start_nodes()
        await self._run_nodes(start_ids)
        return self._get_final_result()

    def _find_start_nodes(self) -> list[str]:
        """Nodes with no incoming edges (roots of the DAG)."""
        targets = {e.target for e in self.agent.edges}
        roots = [n.id for n in self.agent.nodes
                 if n.id not in targets
                 and n.serviceId not in CHATAPP_IDS
                 and n.serviceType != "chatapp"]
        if not roots:
            # Fallback: use order
            api_nodes = [n for n in self.agent.nodes
                         if n.serviceId not in CHATAPP_IDS and n.serviceType != "chatapp"]
            roots = [api_nodes[0].id] if api_nodes else []
        return sorted(roots, key=lambda nid: self.node_map[nid].order)

    def _get_final_result(self) -> str:
        """Collect all results for output."""
        if not self.results:
            return ""
        # Return last executed node's result
        ordered = sorted(self.results.keys(),
                         key=lambda k: self.node_map[k].order if k in self.node_map else 0)
        return self.results.get(ordered[-1], "") if ordered else ""

    def _get_next(self, node_id: str, edge_filter: Optional[str] = None) -> list[str]:
        """Get next node IDs following edges. Filter by edgeType if specified."""
        result = []
        for edge, target_id in self.adj.get(node_id, []):
            if target_id in CHATAPP_IDS or self.node_map.get(target_id, None) and self.node_map[target_id].serviceType == "chatapp":
                continue  # Skip chatapp nodes during execution
            et = edge.edgeType or ""
            if edge_filter is None:
                # No filter: return all non-error, non-loop edges
                if et not in ("error",):
                    result.append(target_id)
            elif edge_filter == "":
                # Default edges only (empty edgeType)
                if et == "":
                    result.append(target_id)
            else:
                # Specific filter
                if et == edge_filter:
                    result.append(target_id)
        return result

    def _get_predecessors(self, node_id: str) -> list[str]:
        """Get all source node IDs that have edges into this node."""
        return [e.source for e in self.agent.edges if e.target == node_id]

    def _build_context(self, node: AgentNodeDef) -> str:
        """Build context from predecessor results."""
        preds = self._get_predecessors(node.id)
        parts = []
        for pid in preds:
            if pid in self.results:
                pred_node = self.node_map.get(pid)
                label = pred_node.serviceId if pred_node else pid
                parts.append(f"[{label}]\n{self.results[pid]}")
        return "\n\n".join(parts)

    def _resolve_variables(self, text: str) -> str:
        """Replace {{varName}} placeholders with variable values."""
        def replacer(match):
            var_name = match.group(1)
            return self.variables.get(var_name, match.group(0))
        return re.sub(r'\{\{(\w+)\}\}', replacer, text)

    async def _notify_status(self, node_id: str, status: str, result: str = ""):
        if self.status_callback:
            try:
                self.status_callback(node_id, status, result)
            except Exception:
                pass

    # ── Node execution ──

    async def _run_nodes(self, node_ids: list[str]):
        """Execute a list of nodes sequentially, skipping already-executed ones."""
        for nid in node_ids:
            if nid in self.executed:
                continue
            # Stop at barrier nodes (e.g. join nodes during fork branches)
            if nid in self._stop_at:
                continue
            node = self.node_map.get(nid)
            if not node:
                continue

            await self._notify_status(nid, "running")
            nt = node.nodeType or "service"

            try:
                if nt == "service":
                    await self._exec_service(node)
                elif nt == "condition":
                    await self._exec_condition(node)
                elif nt == "fork":
                    await self._exec_fork(node)
                elif nt == "join":
                    await self._exec_join(node)
                elif nt == "loop":
                    await self._exec_loop(node)
                elif nt == "delay":
                    await self._exec_delay(node)
                elif nt == "approval":
                    await self._exec_approval(node)
                elif nt == "subroute":
                    await self._exec_subroute(node)
                else:
                    await self._exec_service(node)  # fallback

                self.executed.add(nid)
                await self._notify_status(nid, "completed", self.results.get(nid, ""))
            except Exception as e:
                self.results[nid] = f"Error: {e}"
                self.executed.add(nid)
                await self._notify_status(nid, "error", str(e))
                # Try error edge
                error_next = self._get_next(nid, edge_filter="error")
                if error_next:
                    await self._run_nodes(error_next)
                else:
                    raise

    async def _exec_service(self, node: AgentNodeDef):
        """Execute a service node (LLM call with skill detection)."""
        prompt = self._resolve_variables(node.prompt or f"Use the {node.serviceId} service.")
        context = self._build_context(node)
        if context:
            prompt = f"Previous results:\n{context}\n\n{prompt}"

        result = await self._call_with_retry(node, prompt)
        self.results[node.id] = result
        if node.outputVariable:
            self.variables[node.outputVariable] = result

        # Follow default (non-error) edges
        next_ids = self._get_next(node.id)
        await self._run_nodes(next_ids)

    async def _exec_condition(self, node: AgentNodeDef):
        """Evaluate a condition and follow 'yes' or 'no' edge."""
        condition = self._resolve_variables(node.config.get("condition", node.prompt or ""))
        context = self._build_context(node)

        messages = [
            {"role": "system", "content": "Evaluate the condition and respond ONLY 'yes' or 'no'."},
            {"role": "user", "content": f"Context:\n{context}\n\nCondition: {condition}"},
        ]
        answer = (await self.provider.complete(messages, self.model)).strip().lower()
        result = "yes" if "yes" in answer else "no"
        self.results[node.id] = f"Condition: {condition} → {result}"
        if node.outputVariable:
            self.variables[node.outputVariable] = result

        next_ids = self._get_next(node.id, edge_filter=result)
        if not next_ids:
            # Fallback: try default edges
            next_ids = self._get_next(node.id, edge_filter="")
        await self._run_nodes(next_ids)

    async def _exec_fork(self, node: AgentNodeDef):
        """Execute all outgoing branches in parallel, stopping at join node."""
        next_ids = self._get_next(node.id)
        self.results[node.id] = "Fork"
        if node.outputVariable:
            self.variables[node.outputVariable] = "Fork"

        # Find the matching join node — any join node reachable from fork branches
        matching_joins: set[str] = set()
        for branch_id in next_ids:
            self._find_reachable_joins(branch_id, matching_joins)

        # Set join nodes as barriers so branches stop before entering them
        self._stop_at |= matching_joins

        # Run branches concurrently
        async def run_branch(nid: str):
            await self._run_nodes([nid])

        tasks = [run_branch(nid) for nid in next_ids]
        await asyncio.gather(*tasks)

        # Remove barriers and execute join nodes now that all branches completed
        self._stop_at -= matching_joins
        for join_id in matching_joins:
            if join_id not in self.executed:
                await self._run_nodes([join_id])

    def _find_reachable_joins(self, start_id: str, found: set[str], visited: set[str] | None = None):
        """BFS to find join nodes reachable from a starting node."""
        if visited is None:
            visited = set()
        if start_id in visited:
            return
        visited.add(start_id)
        node = self.node_map.get(start_id)
        if node and (node.nodeType or "service") == "join":
            found.add(start_id)
            return  # Don't traverse past join
        for _edge, target_id in self.adj.get(start_id, []):
            self._find_reachable_joins(target_id, found, visited)

    async def _exec_join(self, node: AgentNodeDef):
        """Merge results from all incoming nodes."""
        incoming = self._get_predecessors(node.id)
        merged = "\n\n".join(
            f"[{self.node_map[sid].serviceId if sid in self.node_map else sid}]\n{self.results.get(sid, '')}"
            for sid in incoming if sid in self.results
        )
        self.results[node.id] = merged
        if node.outputVariable:
            self.variables[node.outputVariable] = merged

        next_ids = self._get_next(node.id)
        await self._run_nodes(next_ids)

    async def _exec_loop(self, node: AgentNodeDef):
        """Execute loop body nodes repeatedly."""
        loop_type = node.config.get("loopType", "count")
        max_iter = int(node.config.get("maxIterations", 5))
        loop_body_ids = self._get_next(node.id, edge_filter="loop")
        exit_ids = self._get_next(node.id, edge_filter="")

        if not loop_body_ids:
            # If no "loop" edges, use all outgoing except "" for exit
            loop_body_ids = self._get_next(node.id)
            exit_ids = []

        iteration_results = []
        for i in range(max_iter):
            self.variables["__loop_index"] = str(i)

            # Allow re-execution of loop body nodes
            for nid in loop_body_ids:
                self.executed.discard(nid)

            await self._run_nodes(loop_body_ids)

            body_result = "\n".join(self.results.get(nid, "") for nid in loop_body_ids if nid in self.results)
            iteration_results.append(f"[Iteration {i + 1}]\n{body_result}")

            # Check while condition
            if loop_type == "while":
                condition = self._resolve_variables(node.config.get("condition", ""))
                if not await self._evaluate_condition(condition):
                    break

        self.results[node.id] = "\n\n".join(iteration_results)
        if node.outputVariable:
            self.variables[node.outputVariable] = self.results[node.id]

        await self._run_nodes(exit_ids)

    async def _exec_delay(self, node: AgentNodeDef):
        """Wait for a specified number of seconds."""
        delay_seconds = int(node.config.get("delaySeconds", 5))
        await asyncio.sleep(delay_seconds)
        self.results[node.id] = f"Delayed {delay_seconds}s"
        if node.outputVariable:
            self.variables[node.outputVariable] = self.results[node.id]

        next_ids = self._get_next(node.id)
        await self._run_nodes(next_ids)

    async def _exec_approval(self, node: AgentNodeDef):
        """Pause for human approval. Save state and wait."""
        context = self._build_context(node)
        timeout_minutes = int(node.config.get("timeoutMinutes", 60))
        auto_action = node.config.get("autoAction", "skip")  # "approve"|"skip"|"abort"

        self.results[node.id] = f"Approval requested (timeout: {timeout_minutes}m)"

        # Save pending approval state
        storage.update_agent_field(self.agent.id, "pending_approval", {
            "nodeId": node.id,
            "context": context[:500],
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "timeout_minutes": timeout_minutes,
            "auto_action": auto_action,
        })

        if node.outputVariable:
            self.variables[node.outputVariable] = "pending_approval"

        # For now, auto-approve and continue (full implementation needs SSE/polling)
        storage.update_agent_field(self.agent.id, "pending_approval", None)

        next_ids = self._get_next(node.id)
        await self._run_nodes(next_ids)

    async def _exec_subroute(self, node: AgentNodeDef):
        """Execute another agent as a sub-agent."""
        sub_agent_id = node.config.get("agentId", "")
        if not sub_agent_id:
            self.results[node.id] = "No sub-agent configured"
            next_ids = self._get_next(node.id)
            await self._run_nodes(next_ids)
            return

        if self.depth >= MAX_RECURSION_DEPTH:
            self.results[node.id] = f"Max recursion depth ({MAX_RECURSION_DEPTH}) reached"
            next_ids = self._get_next(node.id)
            await self._run_nodes(next_ids)
            return

        sub_agent = storage.get_agent(sub_agent_id)
        if not sub_agent:
            self.results[node.id] = f"Sub-agent {sub_agent_id} not found"
            next_ids = self._get_next(node.id)
            await self._run_nodes(next_ids)
            return

        sub_executor = AgentExecutor(sub_agent, self.provider, self.model, depth=self.depth + 1, language=self.language)
        sub_executor.variables = {**self.variables}
        result = await sub_executor.execute()

        self.results[node.id] = result
        if node.outputVariable:
            self.variables[node.outputVariable] = result

        next_ids = self._get_next(node.id)
        await self._run_nodes(next_ids)

    # ── Helper methods ──

    async def _evaluate_condition(self, condition: str) -> bool:
        """Ask LLM to evaluate a condition to yes/no."""
        if not condition:
            return False
        context_parts = [f"{k}={v}" for k, v in self.variables.items() if not k.startswith("__")]
        ctx = ", ".join(context_parts) if context_parts else "none"
        messages = [
            {"role": "system", "content": "Evaluate the condition. Respond ONLY 'yes' or 'no'."},
            {"role": "user", "content": f"Variables: {ctx}\nCondition: {condition}"},
        ]
        answer = (await self.provider.complete(messages, self.model)).strip().lower()
        return "yes" in answer

    async def _call_with_retry(self, node: AgentNodeDef, prompt: str) -> str:
        """Execute LLM call with retry logic and error edge fallback."""
        retry_count = int(node.config.get("retryCount", 0))
        retry_delay = int(node.config.get("retryDelay", 3))
        last_error = None

        for attempt in range(retry_count + 1):
            try:
                return await self._execute_llm(node, prompt)
            except Exception as e:
                last_error = e
                logger.warning("Node '%s' attempt %d/%d failed: %s",
                               node.serviceId, attempt + 1, retry_count + 1, e)
                if attempt < retry_count:
                    await asyncio.sleep(retry_delay)

        # All retries failed — check for error edge
        error_next = self._get_next(node.id, edge_filter="error")
        if error_next:
            self.results[node.id] = f"Error after {retry_count + 1} attempts: {last_error}"
            if node.outputVariable:
                self.variables[node.outputVariable] = self.results[node.id]
            self.executed.add(node.id)
            await self._run_nodes(error_next)
            return self.results[node.id]
        raise last_error  # type: ignore

    def _lang_instruction(self) -> str:
        """Build a language instruction for LLM prompts based on config language."""
        lang_name = LANG_NAMES.get(self.language, self.language)
        if self.language == "en":
            return "6. Answer in English."
        return f"6. You MUST respond ENTIRELY in {lang_name}. All headings, sentences, and explanations must be written in {lang_name}."

    async def _execute_llm(self, node: AgentNodeDef, prompt: str) -> str:
        """Single LLM call with skill detection."""
        lang_inst = self._lang_instruction()
        messages = [{"role": "user", "content": prompt}]

        skill_prompt = build_skill_system_prompt()
        if skill_prompt:
            skill_messages = [
                {"role": "system", "content": skill_prompt},
                *messages,
            ]
            phase1_response = await self.provider.complete(skill_messages, self.model)
            skill_call = parse_skill_call(phase1_response)

            if skill_call:
                skill_result = await execute_skill_call(skill_call)
                phase2_messages = [
                    {"role": "system", "content": (
                        "You are an automated report generator for an agent workflow. "
                        "A real-time search was just performed and the results are provided below. "
                        "RULES:\n"
                        "1. The search results ARE the latest available data. Trust them completely.\n"
                        "2. Extract every available number, date, percentage, and fact from the results.\n"
                        "3. If exact data for today is not in the results, use the MOST RECENT data available and clearly state which date it is from.\n"
                        "4. NEVER say 'I cannot provide' or 'information is unavailable'. Always produce a complete report using the best available data.\n"
                        "5. Format the output cleanly with headers, tables, and bullet points.\n"
                        f"{lang_inst}"
                    )},
                    *messages,
                    {
                        "role": "user",
                        "content": (
                            f"[SEARCH_RESULT]\n{skill_result}\n[/SEARCH_RESULT]\n\n"
                            "Based on the search results above, produce a complete and detailed answer to the original question. "
                            "Use ALL relevant data points from the search results. "
                            "If today's exact data is unavailable, use the most recent available data and note the date."
                        ),
                    },
                ]
                return await self.provider.complete(phase2_messages, self.model)
            else:
                return phase1_response
        else:
            # No skills — direct LLM call with language instruction
            sys_messages = [
                {"role": "system", "content": f"You are an automated agent. {lang_inst}"},
                *messages,
            ]
            return await self.provider.complete(sys_messages, self.model)


# ── Public API (backward compatible) ──

async def execute_agent(agent_id: str) -> None:
    """Run an agent workflow using the graph-based executor."""
    agent = storage.get_agent(agent_id)
    if not agent:
        return

    config = get_config()
    model = config.llm.default_model
    if agent.model:
        test_provider = get_provider_for_model(agent.model)
        if test_provider:
            model = agent.model
        else:
            logger.warning(
                "Agent '%s': model '%s' unavailable, falling back to default '%s'",
                agent.name, agent.model, model,
            )

    if not model:
        logger.warning("Agent '%s': no model configured", agent.name)
        _save_log(agent, "No model configured", "error")
        return

    provider = get_provider_for_model(model)
    if not provider:
        logger.warning("Agent '%s': model '%s' not available", agent.name, model)
        _save_log(agent, f"Model '{model}' is not available", "error")
        return

    # Mark as running
    agent.status = "running"
    storage.update_agent(agent)

    try:
        executor = AgentExecutor(agent, provider, model, language=config.language)
        final_result = await executor.execute()
        accumulated_context = "\n\n".join(
            f"[{executor.node_map[nid].serviceId}]\n{res}"
            for nid, res in executor.results.items()
            if nid in executor.node_map
        )

        # Update agent status
        now = datetime.now(timezone.utc).isoformat()
        agent.status = "completed"
        agent.last_run = now
        agent.last_result = final_result[:500] if final_result else ""
        storage.update_agent(agent)
        _save_log(agent, accumulated_context.strip() or final_result, "success")

        # Send notifications via chatapp nodes
        chatapp_nodes = [n for n in agent.nodes
                         if n.serviceType == "chatapp" or n.serviceId in CHATAPP_IDS]
        chatapp_service_ids = {n.serviceId for n in chatapp_nodes}
        send_whatsapp = "whatsapp" in chatapp_service_ids
        send_telegram = "telegram" in chatapp_service_ids
        send_matrix = "matrix" in chatapp_service_ids
        send_slack = "slack_app" in chatapp_service_ids or "slack" in chatapp_service_ids
        send_discord = "discord" in chatapp_service_ids

        if send_whatsapp or send_telegram or send_matrix or send_slack or send_discord:
            notif = Notification(
                id=str(uuid.uuid4()),
                task_id=agent.id,
                task_name=agent.name or "Agent",
                result=accumulated_context.strip() or final_result,
                notify_apps=SchedulerNotifyApps(
                    whatsapp=send_whatsapp,
                    telegram=send_telegram,
                    matrix=send_matrix,
                    slack=send_slack,
                    discord=send_discord,
                ),
                created_at=now,
            )
            scheduler_storage.add_notification(notif)
            logger.info(
                "Notification queued for agent '%s' -> WA=%s TG=%s MX=%s SL=%s DC=%s",
                agent.name, send_whatsapp, send_telegram, send_matrix, send_slack, send_discord,
            )

    except Exception as e:
        logger.error("Agent '%s' execution error: %s", agent.name, e, exc_info=True)
        agent.status = "error"
        agent.last_run = datetime.now(timezone.utc).isoformat()
        agent.last_result = str(e)[:500]
        storage.update_agent(agent)
        _save_log(agent, f"Error: {e}", "error")


def _save_log(agent: AgentWorkflow, result: str, status: str) -> None:
    log = AgentLog(
        id=str(uuid.uuid4()),
        agent_id=agent.id,
        agent_name=agent.name or "Untitled Agent",
        executed_at=datetime.now(timezone.utc).isoformat(),
        result=result,
        status=status,
    )
    storage.add_log(log)
