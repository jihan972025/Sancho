import logging
import uuid
from datetime import datetime, timezone

from ..config import get_config
from ..llm.registry import get_provider_for_model
from ..skills.loader import build_skill_system_prompt
from ..skills.executor import parse_skill_call, execute_skill_call
from ..scheduler.models import Notification, NotifyApps as SchedulerNotifyApps
from ..scheduler import storage as scheduler_storage
from .agent_models import AgentWorkflow, AgentNodeDef, AgentEdge, AgentLog
from . import agent_storage as storage

logger = logging.getLogger(__name__)


def _topological_sort(nodes: list[AgentNodeDef], edges: list[AgentEdge]) -> list[AgentNodeDef]:
    """Compute execution order from edge graph. Falls back to order field if no edges."""
    if not edges:
        return sorted(nodes, key=lambda n: n.order)

    node_map = {n.id: n for n in nodes}
    in_degree = {n.id: 0 for n in nodes}
    adjacency: dict[str, list[str]] = {n.id: [] for n in nodes}

    for edge in edges:
        if edge.source in adjacency and edge.target in in_degree:
            adjacency[edge.source].append(edge.target)
            in_degree[edge.target] += 1

    # Kahn's algorithm
    queue = sorted(
        [nid for nid, deg in in_degree.items() if deg == 0],
        key=lambda nid: node_map[nid].order,
    )
    result: list[AgentNodeDef] = []

    while queue:
        nid = queue.pop(0)
        result.append(node_map[nid])
        for neighbor in sorted(adjacency[nid], key=lambda x: node_map[x].order):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # Disconnected nodes appended by order
    visited = {n.id for n in result}
    remaining = sorted(
        [n for n in nodes if n.id not in visited],
        key=lambda n: n.order,
    )
    result.extend(remaining)

    return result


async def execute_agent(agent_id: str) -> None:
    """Run an agent workflow: execute each node in order, chaining results."""
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

    sorted_nodes = _topological_sort(agent.nodes, agent.edges)
    accumulated_context = ""
    final_result = ""

    # Separate chatapp nodes (notification targets) from api nodes (execution steps)
    CHATAPP_IDS = {"whatsapp", "telegram", "matrix", "slack_app", "slack"}
    api_nodes = [n for n in sorted_nodes if n.serviceType != "chatapp" and n.serviceId not in CHATAPP_IDS]
    chatapp_nodes = [n for n in sorted_nodes if n.serviceType == "chatapp" or n.serviceId in CHATAPP_IDS]

    try:
        for i, node in enumerate(api_nodes):
            step_label = f"[Step {i + 1}/{len(api_nodes)}: {node.serviceId}]"
            logger.info("Agent '%s' %s", agent.name, step_label)

            # Build prompt for this node
            user_prompt = node.prompt or f"Use the {node.serviceId} service."
            if accumulated_context:
                user_prompt = f"Previous results:\n{accumulated_context}\n\n{user_prompt}"

            messages = [{"role": "user", "content": user_prompt}]

            # Try skill-based execution
            skill_prompt = build_skill_system_prompt()
            if skill_prompt:
                skill_messages = [
                    {"role": "system", "content": skill_prompt},
                    *messages,
                ]
                phase1_response = await provider.complete(skill_messages, model)
                skill_call = parse_skill_call(phase1_response)

                if skill_call:
                    skill_result = await execute_skill_call(skill_call)
                    # Phase 2: final answer with skill result
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
                            "6. Answer in the same language as the user's question."
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
                    step_result = await provider.complete(phase2_messages, model)
                else:
                    step_result = phase1_response
            else:
                step_result = await provider.complete(messages, model)

            accumulated_context += f"\n\n{step_label}\n{step_result}"
            final_result = step_result

        # All API nodes completed successfully
        now = datetime.now(timezone.utc).isoformat()
        agent.status = "completed"
        agent.last_run = now
        agent.last_result = final_result[:500] if final_result else ""
        storage.update_agent(agent)
        _save_log(agent, accumulated_context.strip(), "success")

        # Derive notify_apps from chatapp nodes on the canvas
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
                result=accumulated_context.strip(),
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
