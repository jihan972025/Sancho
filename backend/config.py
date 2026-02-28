import json
import logging
import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


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
    kimi_api_key: str = ""
    openrouter_api_key: str = ""
    cloudflare_account_id: str = ""
    cloudflare_api_key: str = ""
    google_ai_studio_api_key: str = ""
    nvidia_code: str = ""
    local_llm_base_url: str = ""  # e.g. http://localhost:11434/v1 (Ollama)
    local_llm_api_key: str = ""   # Optional — most local LLMs don't require one
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


class SlackConfig(BaseModel):
    enabled: bool = False
    default_model: str = ""
    browser_keywords: list[str] = _BROWSER_KEYWORDS
    file_organize_keywords: list[str] = _FILE_ORGANIZE_KEYWORDS


class DiscordConfig(BaseModel):
    enabled: bool = False
    bot_token: str = ""
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
    upbit_access_key: str = ""
    upbit_secret_key: str = ""
    binance_api_key: str = ""
    binance_secret_key: str = ""
    coinbase_api_key: str = ""
    coinbase_secret_key: str = ""
    bybit_api_key: str = ""
    bybit_secret_key: str = ""
    okx_api_key: str = ""
    okx_secret_key: str = ""
    okx_passphrase: str = ""
    kraken_api_key: str = ""
    kraken_secret_key: str = ""
    mexc_api_key: str = ""
    mexc_secret_key: str = ""
    gateio_api_key: str = ""
    gateio_secret_key: str = ""
    kucoin_api_key: str = ""
    kucoin_secret_key: str = ""
    kucoin_passphrase: str = ""
    bitget_api_key: str = ""
    bitget_secret_key: str = ""
    bitget_passphrase: str = ""
    htx_api_key: str = ""
    htx_secret_key: str = ""


class GoogleAuthConfig(BaseModel):
    access_token: str = ""
    refresh_token: str = ""
    token_expiry: str = ""
    email: str = ""
    name: str = ""
    picture_url: str = ""
    logged_in: bool = False


class OutlookAuthConfig(BaseModel):
    access_token: str = ""
    refresh_token: str = ""
    token_expiry: str = ""
    email: str = ""
    name: str = ""
    logged_in: bool = False


class AppConfig(BaseModel):
    llm: LLMConfig = LLMConfig()
    whatsapp: WhatsAppConfig = WhatsAppConfig()
    telegram: TelegramConfig = TelegramConfig()
    matrix: MatrixConfig = MatrixConfig()
    slack: SlackConfig = SlackConfig()
    discord: DiscordConfig = DiscordConfig()
    api: ApiConfig = ApiConfig()
    custom_apis: list[CustomApiDef] = []
    safe_directories: list[str] = []
    browser_headless: bool = False
    google_auth: GoogleAuthConfig = GoogleAuthConfig()
    outlook_auth: OutlookAuthConfig = OutlookAuthConfig()
    language: str = "en"


_config_dir = Path(os.environ.get("SANCHO_CONFIG_DIR", Path.home() / ".sancho"))
_config_file = _config_dir / "config.json"

# ---------------------------------------------------------------------------
# Sensitive fields to encrypt at rest  (dot-path: "section.field")
# ---------------------------------------------------------------------------

SENSITIVE_FIELDS: list[str] = [
    # LLMConfig
    "llm.openai_api_key",
    "llm.anthropic_api_key",
    "llm.gemini_api_key",
    "llm.zhipuai_api_key",
    "llm.deepseek_api_key",
    "llm.grok_api_key",
    "llm.mistral_api_key",
    "llm.perplexity_api_key",
    "llm.qwen_api_key",
    "llm.llama_api_key",
    "llm.github_api_key",
    "llm.kimi_api_key",
    "llm.openrouter_api_key",
    "llm.cloudflare_api_key",
    "llm.google_ai_studio_api_key",
    "llm.local_llm_api_key",
    "llm.nvidia_code",
    # ApiConfig
    "api.tavily_api_key",
    "api.outlook_client_secret",
    "api.gmail_client_secret",
    "api.google_calendar_client_secret",
    "api.google_sheets_client_secret",
    "api.jira_api_token",
    "api.confluence_api_token",
    "api.slack_bot_token",
    "api.slack_app_token",
    "api.upbit_access_key",
    "api.upbit_secret_key",
    "api.binance_api_key",
    "api.binance_secret_key",
    "api.coinbase_api_key",
    "api.coinbase_secret_key",
    "api.bybit_api_key",
    "api.bybit_secret_key",
    "api.okx_api_key",
    "api.okx_secret_key",
    "api.okx_passphrase",
    "api.kraken_api_key",
    "api.kraken_secret_key",
    "api.mexc_api_key",
    "api.mexc_secret_key",
    "api.gateio_api_key",
    "api.gateio_secret_key",
    "api.kucoin_api_key",
    "api.kucoin_secret_key",
    "api.kucoin_passphrase",
    "api.bitget_api_key",
    "api.bitget_secret_key",
    "api.bitget_passphrase",
    "api.htx_api_key",
    "api.htx_secret_key",
    # DiscordConfig
    "discord.bot_token",
    # TelegramConfig
    "telegram.api_hash",
    # MatrixConfig
    "matrix.password",
    "matrix.access_token",
    # GoogleAuthConfig
    "google_auth.access_token",
    "google_auth.refresh_token",
    # OutlookAuthConfig
    "outlook_auth.access_token",
    "outlook_auth.refresh_token",
]


def _encrypt_sensitive(data: dict) -> dict:
    """Encrypt sensitive fields in a config dict before writing to disk."""
    from .crypto import encrypt_value, encrypt_dict_values

    for dotpath in SENSITIVE_FIELDS:
        section, field = dotpath.split(".", 1)
        if section in data and field in data[section]:
            data[section][field] = encrypt_value(data[section][field])

    # Encrypt custom API headers (may contain Bearer tokens)
    if "custom_apis" in data:
        for api_def in data["custom_apis"]:
            if "headers" in api_def and api_def["headers"]:
                api_def["headers"] = encrypt_dict_values(api_def["headers"])

    return data


def _decrypt_sensitive(data: dict) -> dict:
    """Decrypt sensitive fields in a config dict after reading from disk."""
    from .crypto import decrypt_value, decrypt_dict_values

    for dotpath in SENSITIVE_FIELDS:
        section, field = dotpath.split(".", 1)
        if section in data and field in data[section]:
            data[section][field] = decrypt_value(data[section][field])

    # Decrypt custom API headers
    if "custom_apis" in data:
        for api_def in data["custom_apis"]:
            if "headers" in api_def and api_def["headers"]:
                api_def["headers"] = decrypt_dict_values(api_def["headers"])

    return data


def _needs_migration(data: dict) -> bool:
    """Return True if any sensitive field is non-empty plaintext (no ENC: prefix)."""
    from .crypto import _ENC_PREFIX

    for dotpath in SENSITIVE_FIELDS:
        section, field = dotpath.split(".", 1)
        val = data.get(section, {}).get(field, "")
        if val and not val.startswith(_ENC_PREFIX):
            return True

    if "custom_apis" in data:
        for api_def in data["custom_apis"]:
            for v in (api_def.get("headers") or {}).values():
                if v and not v.startswith(_ENC_PREFIX):
                    return True

    return False


def _ensure_config_dir() -> None:
    _config_dir.mkdir(parents=True, exist_ok=True)


def load_config() -> AppConfig:
    _ensure_config_dir()
    if _config_file.exists():
        data = json.loads(_config_file.read_text(encoding="utf-8"))

        # Check if migration from plaintext → encrypted is needed
        migrate = _needs_migration(data)

        # Decrypt sensitive fields (no-op for plaintext values)
        data = _decrypt_sensitive(data)
        config = AppConfig(**data)

        # Auto-migrate: re-save with encryption on first load after upgrade
        if migrate:
            logger.info("Migrating config to encrypted storage")
            save_config(config)

        return config
    return AppConfig()


def save_config(config: AppConfig) -> None:
    from .crypto import set_strict_permissions

    _ensure_config_dir()
    data = json.loads(config.model_dump_json(indent=2))
    data = _encrypt_sensitive(data)
    _config_file.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    set_strict_permissions(_config_file)


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


_sancho_md_file = _config_dir / "SANCHO.md"


def load_sancho_md() -> Optional[str]:
    _ensure_config_dir()
    if _sancho_md_file.exists():
        return _sancho_md_file.read_text(encoding="utf-8")
    return None


def save_sancho_md(content: str) -> None:
    _ensure_config_dir()
    _sancho_md_file.write_text(content, encoding="utf-8")


_persona_file = _config_dir / "persona.json"


def get_persona_path() -> Path:
    return _persona_file


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
