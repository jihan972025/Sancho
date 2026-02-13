from typing import Optional

from ..config import get_config
from .base import LLMProvider
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider
from .gemini_provider import GeminiProvider
from .zhipuai_provider import ZhipuAIProvider
from .deepseek_provider import DeepSeekProvider
from .grok_provider import GrokProvider
from .mistral_provider import MistralProvider
from .perplexity_provider import PerplexityProvider
from .qwen_provider import QwenProvider
from .llama_provider import LLaMAProvider
from .github_provider import GitHubCopilotProvider
from .kimi_provider import KimiProvider
from .openrouter_provider import OpenRouterProvider
from .cloudflare_provider import CloudflareProvider
from .google_ai_studio_provider import GoogleAIStudioProvider
from .nvidia_provider import NvidiaProvider
from .local_provider import LocalLLMProvider


ALL_PROVIDERS = [
    OpenAIProvider,
    AnthropicProvider,
    GeminiProvider,
    ZhipuAIProvider,
    DeepSeekProvider,
    GrokProvider,
    MistralProvider,
    PerplexityProvider,
    QwenProvider,
    LLaMAProvider,
    GitHubCopilotProvider,
    KimiProvider,
    OpenRouterProvider,
    CloudflareProvider,
    GoogleAIStudioProvider,
    NvidiaProvider,
    LocalLLMProvider,
]

_MODEL_TO_PROVIDER: dict[str, str] = {}

_providers: dict[str, LLMProvider] = {}


def _build_model_map() -> None:
    _MODEL_TO_PROVIDER.clear()
    config = get_config()
    for provider_cls in ALL_PROVIDERS:
        # NVIDIA: model is auto-detected from pasted code
        if provider_cls.name == "nvidia":
            if config.llm.nvidia_code:
                from .nvidia_provider import parse_nvidia_code
                parsed = parse_nvidia_code(config.llm.nvidia_code)
                model = parsed.get("model", "")
                if model:
                    _MODEL_TO_PROVIDER[model] = "nvidia"
            continue
        # Only user-configured models (from custom_models in settings)
        for model in config.llm.custom_models.get(provider_cls.name, []):
            _MODEL_TO_PROVIDER[model] = provider_cls.name


_build_model_map()


_PROVIDER_KEY_MAP = {
    "openai": "openai_api_key",
    "anthropic": "anthropic_api_key",
    "gemini": "gemini_api_key",
    "zhipuai": "zhipuai_api_key",
    "deepseek": "deepseek_api_key",
    "grok": "grok_api_key",
    "mistral": "mistral_api_key",
    "perplexity": "perplexity_api_key",
    "qwen": "qwen_api_key",
    "llama": "llama_api_key",
    "github": "github_api_key",
    "kimi": "kimi_api_key",
    "openrouter": "openrouter_api_key",
    "google_ai_studio": "google_ai_studio_api_key",
}

_PROVIDER_CLASS_MAP = {cls.name: cls for cls in ALL_PROVIDERS}


def _init_provider(provider_name: str) -> Optional[LLMProvider]:
    config = get_config()
    llm = config.llm

    # Local LLM uses base_url instead of just an API key
    if provider_name == "local":
        base_url = llm.local_llm_base_url
        if not base_url:
            return None
        provider_cls = _PROVIDER_CLASS_MAP.get("local")
        if not provider_cls:
            return None
        return provider_cls(api_key=llm.local_llm_api_key, base_url=base_url)

    # Cloudflare Workers AI needs account_id + api_key
    if provider_name == "cloudflare":
        account_id = llm.cloudflare_account_id
        api_key = llm.cloudflare_api_key
        if not account_id or not api_key:
            return None
        provider_cls = _PROVIDER_CLASS_MAP.get("cloudflare")
        if not provider_cls:
            return None
        return provider_cls(api_key=api_key, account_id=account_id)

    # NVIDIA NIM uses full code snippet
    if provider_name == "nvidia":
        code = llm.nvidia_code
        if not code:
            return None
        provider_cls = _PROVIDER_CLASS_MAP.get("nvidia")
        if not provider_cls:
            return None
        return provider_cls(code=code)

    key_attr = _PROVIDER_KEY_MAP.get(provider_name)
    if not key_attr:
        return None
    api_key = getattr(llm, key_attr, "")
    if not api_key:
        return None
    provider_cls = _PROVIDER_CLASS_MAP.get(provider_name)
    if not provider_cls:
        return None
    return provider_cls(api_key)


def get_provider_for_model(model: str) -> Optional[LLMProvider]:
    provider_name = _MODEL_TO_PROVIDER.get(model)
    if not provider_name:
        return None
    if provider_name not in _providers:
        provider = _init_provider(provider_name)
        if provider is None:
            return None
        _providers[provider_name] = provider
    return _providers[provider_name]


def get_available_models() -> list[dict]:
    config = get_config()
    llm = config.llm
    models = []
    for provider_cls in ALL_PROVIDERS:
        # Local LLM: available when base_url is configured
        if provider_cls.name == "local":
            if llm.local_llm_base_url:
                for m in llm.custom_models.get("local", []):
                    models.append({"id": m, "provider": "local"})
            continue

        # Cloudflare: available when both account_id and api_key are set
        if provider_cls.name == "cloudflare":
            if llm.cloudflare_account_id and llm.cloudflare_api_key:
                for m in llm.custom_models.get("cloudflare", []):
                    models.append({"id": m, "provider": "cloudflare"})
            continue

        # NVIDIA NIM: model auto-detected from code snippet
        if provider_cls.name == "nvidia":
            if llm.nvidia_code:
                from .nvidia_provider import parse_nvidia_code
                parsed = parse_nvidia_code(llm.nvidia_code)
                model = parsed.get("model", "")
                if model:
                    models.append({"id": model, "provider": "nvidia"})
            continue

        key_attr = _PROVIDER_KEY_MAP.get(provider_cls.name, "")
        api_key = getattr(llm, key_attr, "")
        if api_key:
            for m in llm.custom_models.get(provider_cls.name, []):
                models.append({"id": m, "provider": provider_cls.name})
    return models


def reset_providers() -> None:
    _providers.clear()
    _build_model_map()
