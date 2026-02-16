import logging
import sys
from pathlib import Path
from typing import Optional

from ..config import get_config
from .base import SkillExecutor
from .executors.duckduckgo_executor import DuckDuckGoExecutor
from .executors.tavily_executor import TavilyExecutor
from .executors.jira_executor import JiraExecutor
from .executors.confluence_executor import ConfluenceExecutor
from .executors.outlook_executor import OutlookExecutor
from .executors.gmail_executor import GmailExecutor
from .executors.google_calendar_executor import GoogleCalendarExecutor
from .executors.google_sheets_executor import GoogleSheetsExecutor
from .executors.slack_executor import SlackExecutor
from .executors.filesystem_executor import FilesystemExecutor
from .executors.wikipedia_executor import WikipediaExecutor
from .executors.info_executor import InfoExecutor
from .executors.fun_executor import FunExecutor
from .executors.yfinance_executor import YFinanceExecutor
from .executors.wttr_executor import WttrExecutor
from .executors.tradingview_executor import TradingViewExecutor
from .executors.frankfurter_executor import FrankfurterExecutor
from .executors.ccxt_executor import CcxtExecutor
from .executors.gnews_executor import GNewsExecutor
from .executors.geopy_executor import GeopyExecutor
from .executors.usgs_executor import UsgsExecutor
from .executors.nagerdate_executor import NagerDateExecutor
from .executors.ipapi_executor import IpApiExecutor
from .executors.timezone_executor import TimezoneExecutor
from .executors.trivia_executor import TriviaExecutor
from .executors.pyshorteners_executor import PyShortenersExecutor
from .executors.restcountries_executor import RestCountriesExecutor
from .executors.zenquotes_executor import ZenQuotesExecutor
from .executors.krnews_executor import KrNewsExecutor
from .executors.upbit_executor import UpbitExecutor
from .executors.custom_api_executor import CustomApiExecutor

logger = logging.getLogger(__name__)

if getattr(sys, 'frozen', False):
    _DEFINITIONS_DIR = Path(sys._MEIPASS) / "backend" / "skills" / "definitions"
else:
    _DEFINITIONS_DIR = Path(__file__).parent / "definitions"

ALL_SKILL_EXECUTORS: list[type[SkillExecutor]] = [
    FilesystemExecutor,
    DuckDuckGoExecutor,
    TavilyExecutor,
    WikipediaExecutor,
    InfoExecutor,
    FunExecutor,
    JiraExecutor,
    ConfluenceExecutor,
    OutlookExecutor,
    GmailExecutor,
    GoogleCalendarExecutor,
    GoogleSheetsExecutor,
    SlackExecutor,
    YFinanceExecutor,
    WttrExecutor,
    TradingViewExecutor,
    FrankfurterExecutor,
    CcxtExecutor,
    GNewsExecutor,
    GeopyExecutor,
    UsgsExecutor,
    NagerDateExecutor,
    IpApiExecutor,
    TimezoneExecutor,
    TriviaExecutor,
    PyShortenersExecutor,
    RestCountriesExecutor,
    ZenQuotesExecutor,
    KrNewsExecutor,
    UpbitExecutor,
]

_skill_instances: dict[str, SkillExecutor] = {}


def _init_skills() -> None:
    _skill_instances.clear()
    config = get_config()
    for executor_cls in ALL_SKILL_EXECUTORS:
        executor = executor_cls(config)
        if executor.is_configured():
            _skill_instances[executor.name] = executor
            logger.info(f"Skill '{executor.name}' is configured and active")

    # Tavily priority: if both are enabled, remove DuckDuckGo
    if "tavily" in _skill_instances and "duckduckgo" in _skill_instances:
        del _skill_instances["duckduckgo"]
        logger.info("Tavily takes priority — DuckDuckGo skill disabled")

    # Register custom API skills
    for api_def in config.custom_apis:
        executor = CustomApiExecutor(api_def)
        if executor.is_configured():
            _skill_instances[executor.name] = executor
            logger.info(f"Custom API skill '{executor.name}' registered")


def get_configured_skills() -> dict[str, SkillExecutor]:
    if not _skill_instances:
        _init_skills()
    return _skill_instances


def get_skill(name: str) -> Optional[SkillExecutor]:
    skills = get_configured_skills()
    return skills.get(name)


def get_definitions_dir() -> Path:
    return _DEFINITIONS_DIR


def reset_skills() -> None:
    _skill_instances.clear()
