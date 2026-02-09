import json
import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel


class LLMConfig(BaseModel):
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    zhipuai_api_key: str = ""
    deepseek_api_key: str = ""
    grok_api_key: str = ""
    mistral_api_key: str = ""
    perplexity_api_key: str = ""
    qwen_api_key: str = ""
    llama_api_key: str = ""
    github_api_key: str = ""
    default_model: str = ""
    custom_models: dict[str, list[str]] = {}


_BROWSER_KEYWORDS: list[str] = [
    # English
    "search", "browse", "find", "open", "look up", "navigate", "go to",
    # Korean (한국어)
    "검색", "찾아", "브라우저", "열어", "사이트", "웹", "접속", "이동",
    # Japanese (日本語)
    "検索", "調べて", "ブラウザ", "開いて", "サイト", "ウェブ",
    # Chinese Simplified (简体中文)
    "搜索", "查找", "浏览器", "打开", "网站", "网页",
    # Chinese Traditional (繁體中文)
    "搜尋", "瀏覽器", "開啟", "網站", "網頁",
    # Spanish (Español)
    "buscar", "navegar", "abrir", "sitio", "web",
    # French (Français)
    "chercher", "rechercher", "naviguer", "ouvrir", "site",
    # German (Deutsch)
    "suchen", "öffnen", "webseite", "browser", "navigieren",
    # Portuguese (Português)
    "pesquisar", "buscar", "abrir", "navegar", "site",
    # Russian (Русский)
    "поиск", "искать", "найти", "открой", "браузер", "сайт",
    # Arabic (العربية)
    "بحث", "ابحث", "افتح", "موقع", "متصفح",
    # Hindi (हिन्दी)
    "खोज", "खोजो", "ब्राउज़र", "खोलो", "वेबसाइट",
    # Vietnamese (Tiếng Việt)
    "tìm kiếm", "tìm", "mở", "trình duyệt", "trang web",
    # Thai (ไทย)
    "ค้นหา", "เปิด", "เว็บ", "เบราว์เซอร์", "ไซต์",
    # Indonesian (Bahasa Indonesia)
    "cari", "buka", "browser", "situs", "web",
    # Turkish (Türkçe)
    "ara", "aç", "tarayıcı", "site", "web",
]


_FILE_ORGANIZE_KEYWORDS: list[str] = [
    # English
    "organize files", "sort files", "clean up folder", "tidy up",
    # Korean (한국어)
    "정리해", "정리 해", "정리하", "파일 정리", "폴더 정리", "폴더를 만들고",
    # Japanese (日本語)
    "整理して", "ファイル整理", "フォルダ整理",
    # Chinese Simplified (简体中文)
    "整理文件", "整理文件夹", "文件归类",
    # Chinese Traditional (繁體中文)
    "整理檔案", "整理資料夾", "檔案歸類",
    # Spanish
    "organizar archivos", "ordenar archivos",
    # French
    "organiser fichiers", "ranger fichiers",
    # German
    "dateien organisieren", "dateien sortieren",
    # Portuguese
    "organizar arquivos", "ordenar arquivos",
    # Russian
    "организовать файлы", "упорядочить файлы",
    # Arabic
    "تنظيم الملفات", "ترتيب الملفات",
    # Hindi
    "फाइलें व्यवस्थित", "फाइल व्यवस्थित",
    # Vietnamese
    "sắp xếp tệp", "dọn dẹp thư mục",
    # Thai
    "จัดระเบียบไฟล์", "จัดเรียงไฟล์",
    # Indonesian
    "atur file", "rapikan folder",
    # Turkish
    "dosyaları düzenle", "dosyaları sırala",
]


class WhatsAppConfig(BaseModel):
    enabled: bool = False
    wa_version: str = "2,3000,1027934701"  # WhatsApp Web protocol version
    default_model: str = ""  # Falls back to llm.default_model when empty
    browser_keywords: list[str] = _BROWSER_KEYWORDS
    file_organize_keywords: list[str] = _FILE_ORGANIZE_KEYWORDS


class TelegramConfig(BaseModel):
    enabled: bool = False
    api_id: str = ""  # From https://my.telegram.org
    api_hash: str = ""  # From https://my.telegram.org
    default_model: str = ""
    browser_keywords: list[str] = _BROWSER_KEYWORDS
    file_organize_keywords: list[str] = _FILE_ORGANIZE_KEYWORDS


class MatrixConfig(BaseModel):
    enabled: bool = False
    homeserver_url: str = "https://matrix.org"
    user_id: str = ""  # @username:matrix.org
    password: str = ""
    access_token: str = ""  # Saved after login, or manually entered
    default_model: str = ""
    browser_keywords: list[str] = _BROWSER_KEYWORDS
    file_organize_keywords: list[str] = _FILE_ORGANIZE_KEYWORDS


class CustomApiDef(BaseModel):
    name: str           # Skill name (lowercase + underscores)
    display_name: str   # UI display name
    description: str    # Description shown to LLM
    url: str            # Endpoint URL ({query} etc. placeholders)
    method: str = "GET" # GET | POST
    headers: dict[str, str] = {}
    body_template: str = ""       # POST body template (JSON string, {query} substitution)
    response_path: str = ""       # JSON path to extract from response (e.g. "data.results")


class ApiConfig(BaseModel):
    duckduckgo_enabled: bool = True
    yfinance_enabled: bool = True
    tavily_api_key: str = ""
    outlook_client_id: str = ""
    outlook_client_secret: str = ""
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    google_calendar_client_id: str = ""
    google_calendar_client_secret: str = ""
    google_sheets_client_id: str = ""
    google_sheets_client_secret: str = ""
    jira_url: str = ""
    jira_email: str = ""
    jira_api_token: str = ""
    confluence_url: str = ""
    confluence_email: str = ""
    confluence_api_token: str = ""
    slack_bot_token: str = ""
    slack_app_token: str = ""


class AppConfig(BaseModel):
    llm: LLMConfig = LLMConfig()
    whatsapp: WhatsAppConfig = WhatsAppConfig()
    telegram: TelegramConfig = TelegramConfig()
    matrix: MatrixConfig = MatrixConfig()
    api: ApiConfig = ApiConfig()
    custom_apis: list[CustomApiDef] = []
    safe_directories: list[str] = []
    browser_headless: bool = False
    language: str = "en"


_config_dir = Path(os.environ.get("SANCHO_CONFIG_DIR", Path.home() / ".sancho"))
_config_file = _config_dir / "config.json"


def _ensure_config_dir() -> None:
    _config_dir.mkdir(parents=True, exist_ok=True)


def load_config() -> AppConfig:
    _ensure_config_dir()
    if _config_file.exists():
        data = json.loads(_config_file.read_text(encoding="utf-8"))
        return AppConfig(**data)
    return AppConfig()


def save_config(config: AppConfig) -> None:
    _ensure_config_dir()
    _config_file.write_text(
        config.model_dump_json(indent=2),
        encoding="utf-8",
    )


_user_md_file = _config_dir / "USER.md"


def get_user_md_path() -> Path:
    return _user_md_file


def load_user_md() -> Optional[str]:
    _ensure_config_dir()
    if _user_md_file.exists():
        return _user_md_file.read_text(encoding="utf-8")
    return None


def save_user_md(content: str) -> None:
    _ensure_config_dir()
    _user_md_file.write_text(content, encoding="utf-8")


_current_config: Optional[AppConfig] = None


def get_config() -> AppConfig:
    global _current_config
    if _current_config is None:
        _current_config = load_config()
    return _current_config


def update_config(config: AppConfig) -> AppConfig:
    global _current_config
    save_config(config)
    _current_config = config
    return _current_config
