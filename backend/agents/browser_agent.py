import asyncio
import json
import logging
from enum import Enum
from typing import Optional

from openai import RateLimitError
from pydantic import BaseModel

from ..browser.playwright_cli import PlaywrightCLI
from ..llm.registry import get_provider_for_model
from ..config import get_config

logger = logging.getLogger(__name__)

BROWSER_SYSTEM_PROMPT = """You are a browser automation agent. You control a web browser to complete tasks.

You will receive a text snapshot of the current page as an accessibility tree. Elements have ref IDs like [ref=e5] that you use to interact with them.

You must respond with a JSON object describing your next action:

{
  "thought": "Brief explanation of what you're doing",
  "action": "<action_name>",
  "params": { ... }
}

Available actions:

## Core Interaction
- "click": {"ref": "e5"} — click an element (optional "button": "left"|"right"|"middle")
- "dblclick": {"ref": "e5"} — double-click an element (optional "button")
- "fill": {"ref": "e5", "text": "query"} — clear and fill a text input by ref
- "type": {"text": "hello"} — type text into the currently focused element
- "drag": {"start_ref": "e3", "end_ref": "e7"} — drag and drop between two elements
- "hover": {"ref": "e5"} — hover over an element
- "select": {"ref": "e5", "value": "option"} — select dropdown option
- "upload": {"file": "C:/path/to/file.png"} — upload a file
- "check": {"ref": "e5"} — check a checkbox or radio button
- "uncheck": {"ref": "e5"} — uncheck a checkbox
- "eval": {"code": "document.title"} — evaluate JavaScript (optional "ref": "e5" for element context)
- "dialog_accept": {} — accept a dialog (optional "prompt": "text" for prompt dialogs)
- "dialog_dismiss": {} — dismiss a dialog
- "resize": {"width": 1280, "height": 720} — resize the browser window
- "delete_data": {} — delete all session data (cookies, storage, etc.)

## Navigation
- "goto": {"url": "https://..."} — navigate to a URL
- "go_back": {} — go back to previous page
- "go_forward": {} — go forward to next page
- "reload": {} — reload the current page

## Keyboard
- "press": {"key": "Enter"} — press a key (Enter, Tab, Escape, ArrowDown, etc.)
- "keydown": {"key": "Shift"} — press a key down (hold)
- "keyup": {"key": "Shift"} — release a key

## Mouse
- "mousemove": {"x": 100, "y": 200} — move mouse to coordinates
- "mousedown": {} — press mouse button down (optional "button": "left"|"right"|"middle")
- "mouseup": {} — release mouse button (optional "button")
- "scroll": {"direction": "down"} — scroll the page (optional "amount": 500)

## Tabs
- "tab_list": {} — list all open tabs
- "tab_new": {} — open a new tab (optional "url": "https://...")
- "tab_select": {"index": 1} — switch to tab by index
- "tab_close": {} — close current tab (optional "index": 1)

## Storage — Cookies
- "cookie_list": {} — list all cookies
- "cookie_get": {"name": "session_id"} — get a cookie by name
- "cookie_set": {"name": "key", "value": "val"} — set a cookie
- "cookie_delete": {"name": "key"} — delete a cookie
- "cookie_clear": {} — clear all cookies

## Storage — LocalStorage
- "localstorage_list": {} — list all localStorage key-value pairs
- "localstorage_get": {"key": "theme"} — get a localStorage item
- "localstorage_set": {"key": "theme", "value": "dark"} — set a localStorage item
- "localstorage_delete": {"key": "theme"} — delete a localStorage item
- "localstorage_clear": {} — clear all localStorage

## Storage — SessionStorage
- "sessionstorage_list": {} — list all sessionStorage key-value pairs
- "sessionstorage_get": {"key": "token"} — get a sessionStorage item
- "sessionstorage_set": {"key": "token", "value": "abc"} — set a sessionStorage item
- "sessionstorage_delete": {"key": "token"} — delete a sessionStorage item
- "sessionstorage_clear": {} — clear all sessionStorage

## Storage — Auth State
- "state_save": {} — save authentication state (optional "filename": "auth.json")
- "state_load": {"filename": "auth.json"} — load saved authentication state

## Network
- "network": {} — list all network requests since page load
- "route": {"pattern": "**/*.png"} — mock network requests matching a URL pattern
- "route_list": {} — list all active network routes
- "unroute": {} — remove all routes (optional "pattern": "**/*.png")

## DevTools
- "console": {} — list console messages (optional "min_level": "error")
- "run_code": {"code": "await page.evaluate(() => ...)"} — run a Playwright code snippet

## Control
- "wait": {} — wait for page to load (2 seconds)
- "done": {"result": "summary of what was accomplished"}

IMPORTANT RULES:
- Use ref IDs from the snapshot to target elements (e.g., "ref": "e12").
- To search: click the search input, then fill it with the query, then press Enter.
- Each action runs once per step. Never repeat the same action you already performed.
- If the page has changed, analyze the NEW snapshot and decide the next action.
- Use "done" when the task objective has been achieved.

Respond ONLY with the JSON object, no other text."""


class AgentStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"


class AgentState(BaseModel):
    status: AgentStatus = AgentStatus.IDLE
    current_step: int = 0
    max_steps: int = 20
    task: str = ""
    last_action: str = ""
    last_thought: str = ""
    error: Optional[str] = None
    result: Optional[str] = None
    last_snapshot: Optional[str] = None


class BrowserAgent:
    def __init__(self) -> None:
        self.cli = PlaywrightCLI()
        self.state = AgentState()
        self._cancel = asyncio.Event()

    async def start_browser(self, headless: bool = False) -> None:
        headed = not headless
        await self.cli.open(headed=headed)

    async def close_browser(self) -> None:
        try:
            await self.cli.close()
        except RuntimeError:
            pass  # already closed
        self.state = AgentState()

    async def navigate(self, url: str) -> str:
        await self.cli.goto(url)
        info = await self.cli.get_page_info()
        return info.get("url", url)

    async def screenshot(self) -> bytes:
        return await self.cli.screenshot()

    async def snapshot(self) -> str:
        text = await self.cli.snapshot()
        self.state.last_snapshot = text
        return text

    def stop(self) -> None:
        self._cancel.set()

    async def _execute_action(self, action: str, params: dict) -> Optional[str]:
        """Execute a single agent action. Returns action output or None."""
        cli = self.cli

        # ── Core Interaction ──
        if action == "click":
            return await cli.click(str(params["ref"]), params.get("button", "left"))
        elif action == "dblclick":
            return await cli.dblclick(str(params["ref"]), params.get("button", "left"))
        elif action == "fill":
            return await cli.fill(str(params["ref"]), params["text"])
        elif action == "type":
            return await cli.type_text(params["text"])
        elif action == "drag":
            return await cli.drag(str(params["start_ref"]), str(params["end_ref"]))
        elif action == "hover":
            return await cli.hover(str(params["ref"]))
        elif action == "select":
            return await cli.select(str(params["ref"]), params["value"])
        elif action == "upload":
            return await cli.upload(params["file"])
        elif action == "check":
            return await cli.check(str(params["ref"]))
        elif action == "uncheck":
            return await cli.uncheck(str(params["ref"]))
        elif action == "eval":
            return await cli.eval_js(params["code"], params.get("ref"))
        elif action == "dialog_accept":
            return await cli.dialog_accept(params.get("prompt"))
        elif action == "dialog_dismiss":
            return await cli.dialog_dismiss()
        elif action == "resize":
            return await cli.resize(params["width"], params["height"])
        elif action == "delete_data":
            return await cli.delete_data()

        # ── Navigation ──
        elif action == "goto":
            return await cli.goto(params["url"])
        elif action == "go_back":
            return await cli.go_back()
        elif action == "go_forward":
            return await cli.go_forward()
        elif action == "reload":
            return await cli.reload()

        # ── Keyboard ──
        elif action == "press":
            return await cli.press(params["key"])
        elif action == "keydown":
            return await cli.keydown(params["key"])
        elif action == "keyup":
            return await cli.keyup(params["key"])

        # ── Mouse ──
        elif action == "mousemove":
            return await cli.mousemove(params["x"], params["y"])
        elif action == "mousedown":
            return await cli.mousedown(params.get("button", "left"))
        elif action == "mouseup":
            return await cli.mouseup(params.get("button", "left"))
        elif action == "scroll":
            return await cli.scroll(params.get("direction", "down"), params.get("amount", 500))

        # ── Tabs ──
        elif action == "tab_list":
            return await cli.tab_list()
        elif action == "tab_new":
            return await cli.tab_new(params.get("url"))
        elif action == "tab_select":
            return await cli.tab_select(params["index"])
        elif action == "tab_close":
            return await cli.tab_close(params.get("index"))

        # ── Storage: Cookies ──
        elif action == "cookie_list":
            return await cli.cookie_list()
        elif action == "cookie_get":
            return await cli.cookie_get(params["name"])
        elif action == "cookie_set":
            return await cli.cookie_set(params["name"], params["value"])
        elif action == "cookie_delete":
            return await cli.cookie_delete(params["name"])
        elif action == "cookie_clear":
            return await cli.cookie_clear()

        # ── Storage: LocalStorage ──
        elif action == "localstorage_list":
            return await cli.localstorage_list()
        elif action == "localstorage_get":
            return await cli.localstorage_get(params["key"])
        elif action == "localstorage_set":
            return await cli.localstorage_set(params["key"], params["value"])
        elif action == "localstorage_delete":
            return await cli.localstorage_delete(params["key"])
        elif action == "localstorage_clear":
            return await cli.localstorage_clear()

        # ── Storage: SessionStorage ──
        elif action == "sessionstorage_list":
            return await cli.sessionstorage_list()
        elif action == "sessionstorage_get":
            return await cli.sessionstorage_get(params["key"])
        elif action == "sessionstorage_set":
            return await cli.sessionstorage_set(params["key"], params["value"])
        elif action == "sessionstorage_delete":
            return await cli.sessionstorage_delete(params["key"])
        elif action == "sessionstorage_clear":
            return await cli.sessionstorage_clear()

        # ── Storage: Auth State ──
        elif action == "state_save":
            return await cli.state_save(params.get("filename"))
        elif action == "state_load":
            return await cli.state_load(params["filename"])

        # ── Network ──
        elif action == "network":
            return await cli.network()
        elif action == "route":
            return await cli.route(params["pattern"])
        elif action == "route_list":
            return await cli.route_list()
        elif action == "unroute":
            return await cli.unroute(params.get("pattern"))

        # ── DevTools ──
        elif action == "console":
            return await cli.console(params.get("min_level"))
        elif action == "run_code":
            return await cli.run_code(params["code"])

        # ── Control ──
        elif action == "wait":
            await asyncio.sleep(2)
            return None
        elif action == "done":
            return None  # handled by caller

        else:
            logger.warning(f"Unknown action: {action}")
            return None

    async def run_task(self, task: str, model: Optional[str] = None) -> AgentState:
        config = get_config()
        model = model or config.llm.default_model

        provider = get_provider_for_model(model)
        if not provider:
            self.state.status = AgentStatus.ERROR
            self.state.error = f"No provider for model: {model}"
            return self.state

        self.state = AgentState(
            status=AgentStatus.RUNNING,
            task=task,
            max_steps=20,
        )
        self._cancel.clear()

        # Conversation history for multi-step context
        conversation: list[dict[str, str]] = [
            {"role": "system", "content": BROWSER_SYSTEM_PROMPT},
        ]
        # Track consecutive duplicate actions
        last_action_fingerprint = ""
        duplicate_count = 0
        MAX_DUPLICATES = 2  # Allow at most 2 identical consecutive actions

        try:
            for step in range(self.state.max_steps):
                if self._cancel.is_set():
                    self.state.status = AgentStatus.IDLE
                    self.state.result = "Task cancelled by user"
                    break

                self.state.current_step = step + 1

                # Capture text snapshot
                snapshot_text = await self.cli.snapshot()
                self.state.last_snapshot = snapshot_text

                # Get page info
                page_info = await self.cli.get_page_info()

                user_msg = (
                    f"Task: {task}\n\n"
                    f"Current URL: {page_info['url']}\n"
                    f"Page Title: {page_info['title']}\n\n"
                    f"Step {step + 1}/{self.state.max_steps}\n\n"
                    f"Page snapshot:\n{snapshot_text}"
                )

                # Add current observation to conversation
                conversation.append({"role": "user", "content": user_msg})

                # Trim conversation if it gets too long (keep system + last 6 turns)
                if len(conversation) > 13:
                    conversation = [conversation[0]] + conversation[-12:]

                # Call LLM with text (no vision API needed)
                logger.info(f"Text call: model={model}, provider={provider.name}")
                response = None
                for attempt in range(4):
                    try:
                        response = await provider.complete(conversation, model)
                        break
                    except RateLimitError:
                        if attempt < 3:
                            wait = (attempt + 1) * 5
                            logger.warning(f"Rate limit hit, waiting {wait}s (attempt {attempt + 1}/3)")
                            await asyncio.sleep(wait)
                        else:
                            raise
                if response is None:
                    continue

                # Parse action
                try:
                    text = response.strip()
                    if text.startswith("```"):
                        text = text.split("\n", 1)[1].rsplit("```", 1)[0]
                    action_data = json.loads(text)
                except (json.JSONDecodeError, IndexError):
                    logger.error(f"Failed to parse LLM action: {response}")
                    continue

                action = action_data.get("action", "")
                params = action_data.get("params", {})
                thought = action_data.get("thought", "")

                # Add LLM response to conversation history
                conversation.append({"role": "assistant", "content": response})

                self.state.last_action = action
                self.state.last_thought = thought
                logger.info(f"Step {step + 1}: {thought} -> {action} {params}")

                # Handle "done" before executing
                if action == "done":
                    self.state.status = AgentStatus.COMPLETED
                    self.state.result = params.get("result", "Task completed")
                    break

                # Detect repeated identical actions
                action_fingerprint = json.dumps({"action": action, "params": params}, sort_keys=True)
                if action_fingerprint == last_action_fingerprint:
                    duplicate_count += 1
                    if duplicate_count >= MAX_DUPLICATES:
                        logger.warning(
                            "Action '%s' repeated %d times — forcing done (step %d)",
                            action, duplicate_count + 1, step + 1,
                        )
                        self.state.status = AgentStatus.COMPLETED
                        self.state.result = thought or "Task completed (stopped due to repeated action)"
                        break
                else:
                    duplicate_count = 0
                    last_action_fingerprint = action_fingerprint

                # Execute action
                await self._execute_action(action, params)

                # Delay between actions
                await asyncio.sleep(1)
            else:
                self.state.status = AgentStatus.COMPLETED
                self.state.result = "Max steps reached"

        except RateLimitError:
            logger.warning("Rate limit persisted after retries (step %d)", self.state.current_step)
            if self.state.current_step > 1:
                self.state.status = AgentStatus.COMPLETED
                self.state.result = f"{self.state.last_thought or 'Task partially completed'} (rate limit at step {self.state.current_step})"
            else:
                self.state.status = AgentStatus.ERROR
                self.state.error = "API rate limit — please wait a moment and try again"
        except Exception as e:
            logger.exception("Browser agent error")
            self.state.status = AgentStatus.ERROR
            self.state.error = str(e)

        return self.state

    async def cancel_and_wait(self, timeout: float = 10) -> None:
        """Cancel the running task and wait for it to stop."""
        if self.state.status != AgentStatus.RUNNING:
            return
        self.stop()
        for _ in range(int(timeout / 0.5)):
            await asyncio.sleep(0.5)
            if self.state.status != AgentStatus.RUNNING:
                break

    def get_state(self) -> AgentState:
        return self.state


# Global singleton
_agent: Optional[BrowserAgent] = None


def get_browser_agent() -> BrowserAgent:
    global _agent
    if _agent is None:
        _agent = BrowserAgent()
    return _agent
