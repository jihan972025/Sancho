"""Shared message processing logic for all chat app integrations (WhatsApp, Telegram, etc.)."""

import json
import logging
import re

from ..config import get_config, load_user_md, load_sancho_md
from ..i18n import t, lang_instruction
from ..llm.registry import get_provider_for_model, get_available_models
from ..memory import build_memory_prompt
from ..memory_extractor import trigger_memory_extraction
from ..persona import build_persona_prompt
from ..conversation.summarizer import build_conversation_context
from ..agents.browser_agent import get_browser_agent, AgentStatus
from ..agents.file_agent import organize_directory
from ..skills.loader import build_skill_system_prompt
from ..skills.executor import parse_skill_call, execute_skill_call
from .whatsapp_history import history

logger = logging.getLogger(__name__)


async def process_chat_message(
    sender: str,
    text: str,
    app_name: str,
    default_model: str,
    browser_keywords: list[str],
    file_organize_keywords: list[str] | None = None,
) -> str:
    """Process an incoming message from any chat app. Returns reply text.

    Args:
        sender: Unique sender identifier (phone number, user ID, etc.)
        text: Message text
        app_name: Chat app name for logging ("whatsapp", "telegram", etc.)
        default_model: Model to use for this chat app
        browser_keywords: Keywords that trigger browser agent
        file_organize_keywords: Keywords that trigger file organization
    """
    config = get_config()
    lang = config.language
    lower = text.strip().lower()

    if file_organize_keywords is None:
        from ..config import _FILE_ORGANIZE_KEYWORDS
        file_organize_keywords = _FILE_ORGANIZE_KEYWORDS

    # Special commands
    if lower == "/clear":
        history.clear(sender)
        return t("clear_history", lang)

    if lower == "/help":
        return t("help_text", lang)

    if lower == "/status":
        agent = get_browser_agent()
        state = agent.get_state()
        return t(
            "status_text", lang,
            status=state.status.value,
            task=state.task or t("status_none", lang),
            step=str(state.current_step),
            max_steps=str(state.max_steps),
            result=state.result or t("status_none", lang),
        )

    # Classify intent
    is_file_organize = _is_file_organize_intent(text, file_organize_keywords)
    is_browser = not is_file_organize and _is_browser_intent(text, browser_keywords)
    effective_model = _resolve_model(default_model)
    logger.info("[%s] model=%s (requested=%s), browser=%s, file_organize=%s", app_name, effective_model, default_model, is_browser, is_file_organize)

    try:
        if is_file_organize:
            return await _handle_file_organize(sender, text, default_model, lang)
        elif is_browser:
            return await _handle_browser(sender, text, default_model, lang)
        else:
            return await _handle_chat(sender, text, default_model, lang)
    except Exception:
        logger.exception("Error handling %s message from %s", app_name, sender)
        return t("processing_error", lang)


def _resolve_model(model: str) -> str:
    """Resolve model name, verifying each candidate actually exists in the registry."""
    # 1) Explicit model — only if a provider exists for it
    if model and get_provider_for_model(model):
        return model
    # 2) Global default — only if a provider exists for it
    config = get_config()
    if config.llm.default_model and get_provider_for_model(config.llm.default_model):
        return config.llm.default_model
    # 3) First available model from any configured provider
    available = get_available_models()
    if available:
        return available[0]["id"]
    return ""


def _is_browser_intent(text: str, keywords: list[str]) -> bool:
    lower = text.lower()
    return any(kw.lower() in lower for kw in keywords)


def _is_file_organize_intent(text: str, keywords: list[str]) -> bool:
    lower = text.lower()
    return any(kw.lower() in lower for kw in keywords)


_PATH_PATTERN = re.compile(r'[A-Za-z]:\\[^\s"\'<>|*?]+')


def _extract_path(text: str) -> str | None:
    """Extract a Windows path from user message text."""
    match = _PATH_PATTERN.search(text)
    return match.group(0).rstrip(".,;:!?") if match else None


def _build_system_prompt(lang: str, recent_message: str = "") -> str:
    """Build a full system prompt with persona, user profile, conversation context, and memory.

    Mirrors the system prompt assembly logic in routes_chat.py so that
    external chat apps (Telegram, WhatsApp, Matrix, Slack) get the same
    AI persona, long-term memory, and conversation summary context.
    """
    parts: list[str] = []

    # 1) Memory (prepended first so it appears at the top)
    memory_block = build_memory_prompt(recent_message=recent_message)
    if memory_block:
        parts.append(memory_block)

    # 2) Conversation summaries
    conv_context = build_conversation_context()
    if conv_context:
        parts.append(conv_context)

    # 3) User profile
    user_md = load_user_md()
    if user_md:
        parts.append(f"\nUser profile:\n{user_md}\n")

    # 4) Persona (persona.json takes priority, falls back to SANCHO.md)
    persona_block = build_persona_prompt()
    if persona_block:
        parts.append(persona_block)
    else:
        sancho_md = load_sancho_md()
        if sancho_md:
            parts.append(f"\nYour persona (follow this identity):\n{sancho_md}\n")
        else:
            parts.append("You are Sancho, a helpful AI assistant. Keep responses concise.")

    # 5) Language instruction
    li = lang_instruction(lang)
    if li:
        parts.append(li)

    return "\n".join(parts)


async def _handle_chat(sender: str, text: str, model: str, lang: str = "en") -> str:
    effective_model = _resolve_model(model)
    if not effective_model:
        return t("no_model", lang)
    provider = get_provider_for_model(effective_model)
    if not provider:
        return t("model_unavailable", lang, model=effective_model)

    history.add_message(sender, "user", text)

    skill_prompt = build_skill_system_prompt()

    # Build full system prompt (persona + memory + conversation summaries + user profile)
    system_content = _build_system_prompt(lang, recent_message=text)

    if skill_prompt is None:
        # No skills configured — original path
        messages = [
            {"role": "system", "content": system_content},
            *history.get_messages(sender),
        ]
        response = await provider.complete(messages, effective_model)
    else:
        # Phase 1: detect skill call (include memory/persona context in skill prompt)
        messages = [
            {"role": "system", "content": system_content + "\n\n" + skill_prompt},
            *history.get_messages(sender),
        ]
        try:
            phase1 = await provider.complete(messages, effective_model)
        except Exception as phase1_err:
            # Phase 1 failed (429 rate limit, etc.) — wait and fallback
            logger.warning("Phase 1 failed: %s — waiting 3s before fallback", phase1_err)
            import asyncio
            await asyncio.sleep(3)
            try:
                fallback_messages = [
                    {"role": "system", "content": system_content},
                    *history.get_messages(sender),
                ]
                response = await provider.complete(fallback_messages, effective_model)
            except Exception:
                response = "⚠️ " + t("rate_limit", lang)
            history.add_message(sender, "assistant", response)
            # Trigger memory extraction even on fallback
            _trigger_extraction(messages + [{"role": "assistant", "content": response}], model)
            return response

        skill_call = parse_skill_call(phase1)

        if not skill_call:
            response = phase1
        else:
            # Execute skill → Phase 2 (with chaining support)
            max_chain = 5
            chain_results: list[tuple[str, str]] = []  # (skill_name, result)
            executed_calls: list[str] = []  # fingerprints of already-executed calls

            for step in range(max_chain):
                # Deduplication: build a fingerprint for this skill call
                call_fingerprint = json.dumps(
                    {"skill": skill_call["skill"], "params": skill_call.get("params", {})},
                    sort_keys=True, ensure_ascii=False,
                )
                if call_fingerprint in executed_calls:
                    logger.warning(
                        "Duplicate skill call detected: '%s' (step %d) — breaking chain",
                        skill_call["skill"], step + 1,
                    )
                    # Generate a final answer from accumulated results
                    if chain_results:
                        last_skill, last_result = chain_results[-1]
                        response = f"✅ {last_skill} completed successfully."
                    else:
                        response = "✅ Task completed."
                    break

                executed_calls.append(call_fingerprint)
                result = await execute_skill_call(skill_call)
                skill_name = skill_call["skill"]
                logger.info("Skill '%s' executed for %s (step %d), result length=%d", skill_name, sender, step + 1, len(result))
                logger.debug("Skill result: %s", result[:500])
                chain_results.append((skill_name, result))

                # Build context from all skill results so far
                results_block = ""
                for sn, sr in chain_results:
                    results_block += f"[SKILL_RESULT skill=\"{sn}\"]\n{sr}\n[/SKILL_RESULT]\n\n"

                is_search = skill_name in ("duckduckgo", "tavily")
                if is_search:
                    search_hint = (
                        "IMPORTANT: You just performed a real-time search. The results below are CURRENT and ACCURATE. "
                        "Always trust the skill results over your own training data.\n"
                    )
                else:
                    search_hint = ""

                # Build list of already-executed skills for dedup hint
                executed_names = [sn for sn, _ in chain_results]
                dedup_hint = ""
                if len(executed_names) >= 1:
                    dedup_hint = (
                        f"\nIMPORTANT: The following skills have ALREADY been executed successfully: {', '.join(executed_names)}. "
                        "Do NOT call the same skill with the same parameters again. "
                        "If the task is already done, answer the user directly.\n"
                    )

                system_hint = (
                    search_hint +
                    dedup_hint +
                    "You have access to all skills listed above. "
                    "If you need to call a DIFFERENT skill to complete the task (e.g. save results to a file), "
                    "output ONLY a [SKILL_CALL] block. Otherwise, answer the user directly."
                )
                user_hint = (
                    "Based on the skill results above, either:\n"
                    "1. Call a DIFFERENT skill if more steps are needed (output ONLY a [SKILL_CALL] block), or\n"
                    "2. Answer the user's question directly.\n"
                    "Do NOT repeat a skill call that was already executed above."
                )

                phase2_messages = [
                    {
                        "role": "system",
                        "content": (
                            system_content + "\n\n" + skill_prompt + "\n\n" + system_hint
                        ),
                    },
                    *history.get_messages(sender),
                    {
                        "role": "user",
                        "content": results_block + user_hint,
                    },
                ]
                phase2_response = await provider.complete(phase2_messages, effective_model)

                # Check if Phase 2 wants to chain another skill call
                next_call = parse_skill_call(phase2_response)
                if next_call:
                    # Check for duplicate BEFORE continuing
                    next_fingerprint = json.dumps(
                        {"skill": next_call["skill"], "params": next_call.get("params", {})},
                        sort_keys=True, ensure_ascii=False,
                    )
                    if next_fingerprint in executed_calls:
                        logger.warning(
                            "LLM requested duplicate skill call '%s' — using text response instead",
                            next_call["skill"],
                        )
                        # Strip the skill call block and use remaining text as response
                        from ..skills.executor import _SKILL_CALL_PATTERN
                        cleaned = _SKILL_CALL_PATTERN.sub("", phase2_response).strip()
                        response = cleaned if cleaned else f"✅ {skill_name} completed successfully."
                        break
                    skill_call = next_call
                    continue
                else:
                    response = phase2_response
                    break
            else:
                # max_chain reached — use last response
                response = phase2_response

    history.add_message(sender, "assistant", response)

    # Trigger memory extraction from this conversation
    extraction_msgs = [
        {"role": "system", "content": system_content},
        *history.get_messages(sender),
    ]
    _trigger_extraction(extraction_msgs, model)

    return response


def _trigger_extraction(messages: list[dict], model: str) -> None:
    """Fire-and-forget memory extraction from chat app conversation."""
    try:
        trigger_memory_extraction(messages, model, conversation_id="")
    except Exception:
        logger.debug("Memory extraction trigger failed (non-critical)", exc_info=True)


async def _handle_file_organize(sender: str, text: str, model: str, lang: str = "en") -> str:
    """Handle file organization requests by directly executing organize_directory."""
    effective_model = _resolve_model(model)
    if not effective_model:
        return t("no_model", lang)

    path = _extract_path(text)
    if not path:
        return t("file_organize_no_path", lang)

    logger.info("File organize: path=%s, instructions=%s", path, text[:100])

    try:
        results = await organize_directory(path, effective_model, instructions=text)
    except FileNotFoundError:
        return t("file_organize_not_found", lang, path=path)
    except ValueError as e:
        return t("file_organize_error", lang, error=str(e))
    except PermissionError:
        return t("file_organize_permission", lang, path=path)

    if not results:
        return t("file_organize_nothing", lang, path=path)

    ok = [r for r in results if r["status"] == "ok"]
    errors = [r for r in results if r["status"] != "ok"]

    lines = []
    for r in ok:
        lines.append(f"  {r['src']} → {r['dst']}")

    summary = t("file_organize_done", lang, count=str(len(ok)), path=path)
    if lines:
        summary += "\n" + "\n".join(lines)
    if errors:
        summary += f"\n\n({len(errors)} failed)"

    history.add_message(sender, "user", text)
    history.add_message(sender, "assistant", summary)
    return summary


async def _handle_browser(sender: str, text: str, model: str, lang: str = "en") -> str:
    effective_model = _resolve_model(model)
    if not effective_model:
        return t("no_model", lang)
    agent = get_browser_agent()
    state = agent.get_state()

    # Cancel running task so new command can take over the browser
    if state.status == AgentStatus.RUNNING:
        logger.info("Cancelling running browser task for new command: %s", text[:80])
        await agent.cancel_and_wait()

    try:
        config = get_config()
        await agent.start_browser(headless=config.browser_headless)
        result_state = await agent.run_task(text, effective_model)

        if result_state.status == AgentStatus.COMPLETED:
            return t("browser_completed", lang, result=result_state.result or t("browser_completed_default", lang))
        elif result_state.status == AgentStatus.ERROR:
            return t("browser_error", lang, error=str(result_state.error))
        else:
            return t("browser_status", lang, status=result_state.status.value)
    except Exception as e:
        logger.exception("Browser agent error")
        return t("browser_agent_error", lang, error=str(e))
