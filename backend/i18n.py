"""Simple dict-based i18n module for the backend."""

import json
from pathlib import Path

_locales_dir = Path(__file__).parent / "locales"
_cache: dict[str, dict[str, str]] = {}


def _load(lang: str) -> dict[str, str]:
    if lang not in _cache:
        path = _locales_dir / f"{lang}.json"
        if path.exists():
            _cache[lang] = json.loads(path.read_text(encoding="utf-8"))
        else:
            _cache[lang] = {}
    return _cache[lang]


LANG_NAMES: dict[str, str] = {
    "en": "English",
    "ko": "Korean",
    "ja": "Japanese",
    "zh": "Chinese",
    "zh-TW": "Traditional Chinese",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "pt": "Portuguese",
    "ru": "Russian",
    "ar": "Arabic",
    "hi": "Hindi",
    "vi": "Vietnamese",
    "th": "Thai",
    "id": "Indonesian",
    "tr": "Turkish",
}


def lang_instruction(lang: str) -> str:
    """Return an LLM system prompt instruction for responding in the given language."""
    name = LANG_NAMES.get(lang, lang)
    if lang == "en":
        return ""
    return f" Always respond in {name}."


def t(key: str, lang: str = "en", **kwargs: str) -> str:
    """Look up a translation key, with optional format kwargs.

    Falls back to English if the key is missing in the requested language.
    """
    strings = _load(lang)
    text = strings.get(key)
    if text is None:
        text = _load("en").get(key, key)
    if kwargs:
        text = text.format(**kwargs)
    return text
