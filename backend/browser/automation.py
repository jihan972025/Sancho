import asyncio
import logging
import sys
import threading
from typing import Optional

logger = logging.getLogger(__name__)


class _PlaywrightLoop:
    """Dedicated thread with ProactorEventLoop (Windows) for Playwright async operations."""

    def __init__(self) -> None:
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None

    def ensure_started(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        ready = threading.Event()
        self._thread = threading.Thread(target=self._run, args=(ready,), daemon=True)
        self._thread.start()
        ready.wait()

    def _run(self, ready: threading.Event) -> None:
        if sys.platform == "win32":
            self._loop = asyncio.ProactorEventLoop()
        else:
            self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        ready.set()
        self._loop.run_forever()

    def run(self, coro) -> any:
        """Submit coroutine to the Playwright thread, block until done."""
        assert self._loop is not None
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result(timeout=60)


_pw_loop = _PlaywrightLoop()


class BrowserAutomation:
    """Playwright wrapper for browser automation."""

    def __init__(self, headless: bool = False) -> None:
        self.headless = headless
        self._playwright = None
        self._browser = None
        self._page = None

    # ── Internal async methods (run on ProactorEventLoop thread) ──

    async def _start_async(self) -> None:
        if self._browser:
            return
        from playwright.async_api import async_playwright
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=self.headless)
        self._page = await self._browser.new_page(viewport={"width": 1280, "height": 720})
        logger.info("Browser started")

    async def _close_async(self) -> None:
        if self._page:
            await self._page.close()
            self._page = None
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None
        logger.info("Browser closed")

    async def _navigate_async(self, url: str) -> str:
        self._ensure_page()
        await self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
        return self._page.url

    async def _screenshot_async(self) -> bytes:
        self._ensure_page()
        return await self._page.screenshot(type="png", full_page=False)

    async def _click_async(self, x: int, y: int) -> None:
        self._ensure_page()
        await self._page.mouse.click(x, y)
        await asyncio.sleep(0.5)

    async def _type_text_async(self, text: str) -> None:
        self._ensure_page()
        # Select all existing text first, so new text replaces it
        await self._page.keyboard.press("Control+a")
        await self._page.keyboard.type(text, delay=50)

    async def _press_key_async(self, key: str) -> None:
        self._ensure_page()
        await self._page.keyboard.press(key)

    async def _scroll_async(self, direction: str, amount: int) -> None:
        self._ensure_page()
        delta = amount if direction == "down" else -amount
        await self._page.mouse.wheel(0, delta)
        await asyncio.sleep(0.3)

    async def _get_clickable_elements_async(self) -> list[dict]:
        self._ensure_page()
        return await self._page.evaluate("""() => {
            const clickable = document.querySelectorAll(
                'a, button, input, select, textarea, [role="button"], [onclick], [tabindex]'
            );
            const results = [];
            for (const el of clickable) {
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                if (rect.top > window.innerHeight || rect.left > window.innerWidth) continue;

                const tag = el.tagName.toLowerCase();
                const text = el.textContent?.trim().slice(0, 100) || '';
                const placeholder = el.getAttribute('placeholder') || '';
                const ariaLabel = el.getAttribute('aria-label') || '';
                const href = el.getAttribute('href') || '';
                const type = el.getAttribute('type') || '';

                results.push({
                    index: results.length,
                    tag,
                    text,
                    placeholder,
                    ariaLabel,
                    href,
                    type,
                    x: Math.round(rect.x + rect.width / 2),
                    y: Math.round(rect.y + rect.height / 2),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                });
            }
            return results;
        }""")

    async def _get_page_info_async(self) -> dict:
        self._ensure_page()
        return {
            "url": self._page.url,
            "title": await self._page.title(),
        }

    def _ensure_page(self):
        if not self._page:
            raise RuntimeError("Browser not started")

    # ── Public async API (dispatches to Playwright thread) ──

    def _dispatch(self, coro):
        """Run coroutine on the Playwright ProactorEventLoop thread, return awaitable."""
        loop = asyncio.get_event_loop()
        return loop.run_in_executor(None, _pw_loop.run, coro)

    async def start(self) -> None:
        _pw_loop.ensure_started()
        await self._dispatch(self._start_async())

    async def close(self) -> None:
        await self._dispatch(self._close_async())

    async def navigate(self, url: str) -> str:
        return await self._dispatch(self._navigate_async(url))

    async def screenshot(self) -> bytes:
        return await self._dispatch(self._screenshot_async())

    async def get_clickable_elements(self) -> list[dict]:
        return await self._dispatch(self._get_clickable_elements_async())

    async def click(self, x: int, y: int) -> None:
        await self._dispatch(self._click_async(x, y))

    async def type_text(self, text: str) -> None:
        await self._dispatch(self._type_text_async(text))

    async def press_key(self, key: str) -> None:
        await self._dispatch(self._press_key_async(key))

    async def scroll(self, direction: str = "down", amount: int = 300) -> None:
        await self._dispatch(self._scroll_async(direction, amount))

    async def get_page_info(self) -> dict:
        return await self._dispatch(self._get_page_info_async())
