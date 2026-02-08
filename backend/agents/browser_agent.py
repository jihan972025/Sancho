import asyncio
import json
import logging
from enum import Enum
from typing import Optional

from openai import RateLimitError
from pydantic import BaseModel

from ..browser.automation import BrowserAutomation
from ..llm.registry import get_provider_for_model
from ..config import get_config

logger = logging.getLogger(__name__)

BROWSER_SYSTEM_PROMPT = """You are a browser automation agent. You control a web browser to complete tasks.

You will receive:
1. A screenshot of the current page
2. A list of clickable elements with their coordinates
3. The current URL and page title

You must respond with a JSON object describing your next action:

{
  "thought": "Brief explanation of what you're doing",
  "action": "click" | "type" | "scroll" | "navigate" | "press_key" | "wait" | "done",
  "params": {
    // For "click": {"x": number, "y": number}
    // For "type": {"text": "string to type"}
    // For "scroll": {"direction": "up" | "down"}
    // For "navigate": {"url": "https://..."}
    // For "press_key": {"key": "Enter" | "Tab" | "Escape" | etc.}
    // For "wait": {}
    // For "done": {"result": "summary of what was accomplished"}
  }
}

IMPORTANT RULES:
- To search: first click the search box, then type the query, then press_key "Enter". Do NOT repeat the same action.
- Each action runs once per step. Never repeat the same action you already performed.
- Look at the screenshot carefully. If the text is already typed in the input box, do NOT type it again. Instead press_key "Enter" to submit.
- If the page has changed (new URL or new content), analyze the NEW page and decide the next action accordingly.
- Use "done" when the task objective has been achieved.

Respond ONLY with the JSON object, no other text.
"""


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


class BrowserAgent:
    def __init__(self) -> None:
        self.browser = BrowserAutomation()
        self.state = AgentState()
        self._cancel = asyncio.Event()

    async def start_browser(self, headless: bool = False) -> None:
        self.browser.headless = headless
        await self.browser.start()

    async def close_browser(self) -> None:
        await self.browser.close()
        self.state = AgentState()

    async def navigate(self, url: str) -> str:
        return await self.browser.navigate(url)

    async def screenshot(self) -> bytes:
        return await self.browser.screenshot()

    def stop(self) -> None:
        self._cancel.set()

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

        try:
            for step in range(self.state.max_steps):
                if self._cancel.is_set():
                    self.state.status = AgentStatus.IDLE
                    self.state.result = "Task cancelled by user"
                    break

                self.state.current_step = step + 1

                # Capture screenshot
                screenshot_bytes = await self.browser.screenshot()

                # Get clickable elements
                elements = await self.browser.get_clickable_elements()
                page_info = await self.browser.get_page_info()

                # Format elements for LLM
                elements_text = "\n".join(
                    f"[{e['index']}] <{e['tag']}> '{e.get('text', '')[:50]}' "
                    f"placeholder='{e.get('placeholder', '')}' "
                    f"at ({e['x']},{e['y']})"
                    for e in elements[:50]  # Limit to 50 elements
                )

                user_msg = (
                    f"Task: {task}\n\n"
                    f"Current URL: {page_info['url']}\n"
                    f"Page Title: {page_info['title']}\n\n"
                    f"Step {step + 1}/{self.state.max_steps}\n\n"
                    f"Clickable elements:\n{elements_text}"
                )

                messages = [
                    {"role": "system", "content": BROWSER_SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ]

                # Call LLM with vision (retry on rate limit)
                logger.info(f"Vision call: model={model}, provider={provider.name}")
                response = None
                for attempt in range(4):  # initial + 3 retries
                    try:
                        response = await provider.vision(
                            messages, [screenshot_bytes], model
                        )
                        break
                    except RateLimitError:
                        if attempt < 3:
                            wait = (attempt + 1) * 5  # 5s, 10s, 15s
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

                self.state.last_action = action
                self.state.last_thought = thought
                logger.info(f"Step {step + 1}: {thought} -> {action} {params}")

                # Execute action
                if action == "click":
                    await self.browser.click(params["x"], params["y"])
                elif action == "type":
                    await self.browser.type_text(params["text"])
                elif action == "scroll":
                    await self.browser.scroll(params.get("direction", "down"))
                elif action == "navigate":
                    await self.browser.navigate(params["url"])
                elif action == "press_key":
                    await self.browser.press_key(params["key"])
                elif action == "wait":
                    await asyncio.sleep(2)
                elif action == "done":
                    self.state.status = AgentStatus.COMPLETED
                    self.state.result = params.get("result", "Task completed")
                    break
                else:
                    logger.warning(f"Unknown action: {action}")

                # Delay between actions (helps avoid rate limits on low-concurrency models)
                await asyncio.sleep(2)
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

    def get_state(self) -> AgentState:
        return self.state


# Global singleton
_agent: Optional[BrowserAgent] = None


def get_browser_agent() -> BrowserAgent:
    global _agent
    if _agent is None:
        _agent = BrowserAgent()
    return _agent
