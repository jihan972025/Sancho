import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..config import get_config, load_user_md, _BROWSER_KEYWORDS, _FILE_ORGANIZE_KEYWORDS
from ..i18n import t, lang_instruction
from ..llm.registry import get_provider_for_model, get_available_models
from ..skills.loader import build_skill_system_prompt
from ..skills.executor import parse_skill_call, execute_skill_call
from ..agents.browser_agent import get_browser_agent, AgentStatus
from ..agents.file_agent import organize_directory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])

_cancel_events: dict[str, asyncio.Event] = {}


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str
    stream: bool = True
    session_id: Optional[str] = None


def _is_browser_intent(text: str) -> bool:
    lower = text.lower()
    return any(kw.lower() in lower for kw in _BROWSER_KEYWORDS)


def _is_file_organize_intent(text: str) -> bool:
    lower = text.lower()
    return any(kw.lower() in lower for kw in _FILE_ORGANIZE_KEYWORDS)


import re
_PATH_PATTERN = re.compile(r'[A-Za-z]:\\[^\s"\'<>|*?]+')


@router.post("/send")
async def send_message(req: ChatRequest):
    provider = get_provider_for_model(req.model)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Model '{req.model}' is not available. Check your API key settings.",
        )

    messages = [m.model_dump() for m in req.messages]
    session_id = req.session_id or "default"

    # Check if the last user message is a browser or file organize intent
    last_user_msg = ""
    for m in reversed(messages):
        if m["role"] == "user":
            last_user_msg = m["content"]
            break

    if last_user_msg and _is_file_organize_intent(last_user_msg):
        return await _handle_file_organize_stream(last_user_msg, req.model, session_id)

    if last_user_msg and _is_browser_intent(last_user_msg):
        return await _handle_browser_stream(last_user_msg, req.model, session_id)

    # Inject language instruction into existing system message or prepend one
    li = lang_instruction(get_config().language)
    if li:
        if messages and messages[0]["role"] == "system":
            messages[0] = {**messages[0], "content": messages[0]["content"] + li}
        else:
            messages.insert(0, {"role": "system", "content": li.strip()})

    # Inject user profile from USER.md
    user_md = load_user_md()
    if user_md:
        profile_block = f"\nUser profile:\n{user_md}\n"
        if messages and messages[0]["role"] == "system":
            messages[0] = {**messages[0], "content": profile_block + messages[0]["content"]}
        else:
            messages.insert(0, {"role": "system", "content": profile_block.strip()})

    skill_prompt = build_skill_system_prompt()

    if req.stream:
        cancel_event = asyncio.Event()
        _cancel_events[session_id] = cancel_event

        if skill_prompt is None:
            # No skills configured — original zero-overhead path
            async def event_stream():
                try:
                    async for token in provider.stream(messages, req.model):
                        if cancel_event.is_set():
                            yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                            return
                        yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                    yield f"data: {json.dumps({'type': 'done', 'reason': 'complete'})}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
                finally:
                    _cancel_events.pop(session_id, None)
        else:
            # Skill-enabled 2-phase path
            async def event_stream():
                try:
                    # Inject skill system prompt
                    skill_messages = [
                        {"role": "system", "content": skill_prompt},
                        *messages,
                    ]

                    # Phase 1: non-streaming complete to detect skill call
                    yield f"data: {json.dumps({'type': 'thinking', 'content': 'Analyzing request...'})}\n\n"

                    if cancel_event.is_set():
                        yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                        return

                    try:
                        phase1_response = await provider.complete(skill_messages, req.model)
                    except Exception as phase1_err:
                        # Phase 1 failed (429 rate limit, etc.) — wait and fallback
                        logger.warning("Phase 1 failed: %s — waiting 3s before fallback", phase1_err)
                        await asyncio.sleep(3)
                        try:
                            async for token in provider.stream(messages, req.model):
                                if cancel_event.is_set():
                                    yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                                    return
                                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                            yield f"data: {json.dumps({'type': 'done', 'reason': 'complete'})}\n\n"
                        except Exception:
                            yield f"data: {json.dumps({'type': 'token', 'content': '⚠️ ' + t('rate_limit', get_config().language)})}\n\n"
                            yield f"data: {json.dumps({'type': 'done', 'reason': 'complete'})}\n\n"
                        return

                    if cancel_event.is_set():
                        yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                        return

                    skill_call = parse_skill_call(phase1_response)

                    if not skill_call:
                        # No skill needed — send Phase 1 response as tokens
                        for char in _chunk_text(phase1_response):
                            if cancel_event.is_set():
                                yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                                return
                            yield f"data: {json.dumps({'type': 'token', 'content': char})}\n\n"
                        yield f"data: {json.dumps({'type': 'done', 'reason': 'complete'})}\n\n"
                    else:
                        # Skill call detected — execute with chaining support
                        max_chain = 5
                        chain_results: list[tuple[str, str]] = []

                        for step in range(max_chain):
                            skill_name = skill_call["skill"]
                            yield f"data: {json.dumps({'type': 'skill_start', 'content': skill_name})}\n\n"

                            result = await execute_skill_call(skill_call)

                            if cancel_event.is_set():
                                yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                                return

                            yield f"data: {json.dumps({'type': 'skill_result', 'content': skill_name})}\n\n"
                            chain_results.append((skill_name, result))

                            # Build context from all skill results
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

                            system_hint = (
                                search_hint +
                                "You have access to all skills listed above. "
                                "If you need to call another skill to complete the task (e.g. save results to a file), "
                                "output ONLY a [SKILL_CALL] block. Otherwise, answer the user directly."
                            )
                            user_hint = (
                                "Based on the skill results above, either:\n"
                                "1. Call another skill if more steps are needed (output ONLY a [SKILL_CALL] block), or\n"
                                "2. Answer the user's question directly."
                            )

                            phase2_messages = [
                                {"role": "system", "content": skill_prompt + "\n\n" + system_hint + li},
                                *messages,
                                {"role": "user", "content": results_block + user_hint},
                            ]

                            if step == max_chain - 1:
                                # Last allowed step — stream response directly
                                async for token in provider.stream(phase2_messages, req.model):
                                    if cancel_event.is_set():
                                        yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                                        return
                                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
                                yield f"data: {json.dumps({'type': 'done', 'reason': 'complete'})}\n\n"
                                break
                            else:
                                # Check for chaining
                                phase2_response = await provider.complete(phase2_messages, req.model)
                                next_call = parse_skill_call(phase2_response)
                                if next_call:
                                    skill_call = next_call
                                    continue
                                else:
                                    # No more skill calls — stream the final response
                                    for char in _chunk_text(phase2_response):
                                        if cancel_event.is_set():
                                            yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                                            return
                                        yield f"data: {json.dumps({'type': 'token', 'content': char})}\n\n"
                                    yield f"data: {json.dumps({'type': 'done', 'reason': 'complete'})}\n\n"
                                    break

                except Exception as e:
                    logger.error(f"Skill chat error: {e}", exc_info=True)
                    yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
                finally:
                    _cancel_events.pop(session_id, None)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    else:
        try:
            result = await provider.complete(messages, req.model)
            return {"content": result}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


async def _handle_file_organize_stream(task: str, model: str, session_id: str):
    """Handle file organization and return SSE stream."""
    cancel_event = asyncio.Event()
    _cancel_events[session_id] = cancel_event
    lang = get_config().language

    async def organize_stream():
        try:
            match = _PATH_PATTERN.search(task)
            if not match:
                msg = t("file_organize_no_path", lang)
                yield f"data: {json.dumps({'type': 'token', 'content': msg})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'reason': 'complete'})}\n\n"
                return

            path = match.group(0).rstrip(".,;:!?")

            yield f"data: {json.dumps({'type': 'skill_start', 'content': 'filesystem'})}\n\n"

            results = await organize_directory(path, model, instructions=task)

            yield f"data: {json.dumps({'type': 'skill_result', 'content': 'filesystem'})}\n\n"

            if not results:
                reply = t("file_organize_nothing", lang, path=path)
            else:
                ok = [r for r in results if r["status"] == "ok"]
                errors = [r for r in results if r["status"] != "ok"]
                lines = [f"  {r['src']} → {r['dst']}" for r in ok]
                reply = t("file_organize_done", lang, count=str(len(ok)), path=path)
                if lines:
                    reply += "\n" + "\n".join(lines)
                if errors:
                    reply += f"\n\n({len(errors)} failed)"

            for chunk in _chunk_text(reply):
                if cancel_event.is_set():
                    yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                    return
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'reason': 'complete'})}\n\n"

        except Exception as e:
            logger.error(f"File organize stream error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
        finally:
            _cancel_events.pop(session_id, None)

    return StreamingResponse(
        organize_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _handle_browser_stream(task: str, model: str, session_id: str):
    """Handle browser agent task and return SSE stream."""
    cancel_event = asyncio.Event()
    _cancel_events[session_id] = cancel_event
    lang = get_config().language

    async def browser_stream():
        try:
            agent = get_browser_agent()
            state = agent.get_state()

            # Cancel running task so new command can take over the browser
            if state.status == AgentStatus.RUNNING:
                logger.info("Cancelling running browser task for new command")
                await agent.cancel_and_wait()

            yield f"data: {json.dumps({'type': 'skill_start', 'content': 'browser'})}\n\n"

            config = get_config()
            await agent.start_browser(headless=config.browser_headless)

            if cancel_event.is_set():
                yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                return

            result_state = await agent.run_task(task, model)

            yield f"data: {json.dumps({'type': 'skill_result', 'content': 'browser'})}\n\n"

            if result_state.status == AgentStatus.COMPLETED:
                reply = result_state.result or t("browser_completed_default", lang)
            elif result_state.status == AgentStatus.ERROR:
                reply = f"Error: {result_state.error}"
            else:
                reply = f"Browser agent status: {result_state.status.value}"

            for chunk in _chunk_text(reply):
                if cancel_event.is_set():
                    yield f"data: {json.dumps({'type': 'done', 'reason': 'cancelled'})}\n\n"
                    return
                yield f"data: {json.dumps({'type': 'token', 'content': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'reason': 'complete'})}\n\n"

        except Exception as e:
            logger.error(f"Browser stream error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
        finally:
            _cancel_events.pop(session_id, None)

    return StreamingResponse(
        browser_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _chunk_text(text: str, chunk_size: int = 4) -> list[str]:
    """Split text into chunks for simulated streaming."""
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]


@router.post("/stop")
async def stop_generation(session_id: str = "default"):
    event = _cancel_events.get(session_id)
    if event:
        event.set()
        return {"status": "stopped"}
    return {"status": "no_active_generation"}


@router.get("/models")
async def list_models():
    return {"models": get_available_models()}
