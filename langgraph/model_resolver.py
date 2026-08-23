"""
model_resolver.py — runtime tier->model resolution for the LangGraph orchestrator.

Reads ../.ucp/models.yaml, walks provider_order (OpenRouter, Anthropic, OpenAI, Google, Local),
and returns the first model that (a) has credentials/endpoint configured and (b) instantiates
successfully. Caches resolution per tier.

Supported providers:
- openrouter: Multi-key pooling across OPENROUTER_API_KEY / OPENROUTER_API_KEYS with automatic rotation on quota/429.
- anthropic_api: ANTHROPIC_API_KEY -> ChatAnthropic
- openai: OPENAI_API_KEY -> ChatOpenAI
- google: GEMINI_API_KEY / GOOGLE_API_KEY -> ChatGoogleGenerativeAI
- local: OLLAMA_HOST / LOCAL_OPENAI_URL -> ChatOllama or local ChatOpenAI with reachability checks.

Usage inside orchestrator.py:

    from model_resolver import get_llm
    llm = get_llm("reasoning")                   # -> a ready LangChain chat model
    llm = get_llm(task="solution_architecture")  # -> tier looked up from tasks mapping
"""

import os
import re
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Any, List, Optional, Sequence

import yaml

REGISTRY = Path(__file__).resolve().parent.parent / ".ucp" / "models.yaml"

_PROVIDER_ENV = {
    "openrouter": ["OPENROUTER_API_KEY", "OPENROUTER_API_KEYS"],
    "anthropic_api": ["ANTHROPIC_API_KEY"],
    "openai": ["OPENAI_API_KEY"],
    "google": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    "local": None,  # Local Ollama / OpenAI-compatible server needs no key
}


def _registry() -> dict:
    return yaml.safe_load(REGISTRY.read_text(encoding="utf-8"))


def get_openrouter_keys() -> List[str]:
    """Collect all unique configured OpenRouter API keys from environment."""
    keys: List[str] = []

    # 1. Multi-key env var (comma-separated or whitespace-separated)
    if multi := os.getenv("OPENROUTER_API_KEYS"):
        for part in re.split(r"[,;\s]+", multi.strip()):
            k = part.strip()
            if k and k not in keys:
                keys.append(k)

    # 2. Standard single-key env var (can also be comma-separated)
    if single := os.getenv("OPENROUTER_API_KEY"):
        for part in re.split(r"[,;\s]+", single.strip()):
            k = part.strip()
            if k and k not in keys:
                keys.append(k)

    return keys


def is_local_available(host: Optional[str] = None, timeout: float = 1.0) -> bool:
    """Probe if local Ollama or OpenAI-compatible endpoint is reachable."""
    target = (
        host
        or os.getenv("OLLAMA_HOST")
        or os.getenv("LOCAL_OPENAI_URL")
        or "http://localhost:11434"
    ).rstrip("/")

    if not target.startswith("http://") and not target.startswith("https://"):
        target = f"http://{target}"

    # Try Ollama /api/tags first
    try:
        req = urllib.request.Request(
            f"{target}/api/tags",
            headers={"User-Agent": "FabricAtlas-LangGraph"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status in (200, 404):
                return True
    except Exception:
        pass

    # Try standard /v1/models endpoint (vLLM, LMStudio, LocalAI, Ollama v1)
    try:
        v1_url = target if target.endswith("/v1") else f"{target}/v1"
        req = urllib.request.Request(
            f"{v1_url}/models",
            headers={"User-Agent": "FabricAtlas-LangGraph"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status in (200, 401, 403, 404):
                return True
    except Exception:
        pass

    return False


class OpenRouterRotatingChatModel:
    """ChatModel proxy for OpenRouter that rotates through available API keys
    upon encountering rate limits (HTTP 429), quota errors, or auth failures.
    """

    def __init__(self, model: str, keys: Sequence[str], base_url: Optional[str] = None):
        self.model = model
        self.keys = list(keys) or ["sk-or-dummy-key"]
        self.base_url = base_url or os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        self._current_index = 0
        self._instances: dict[str, Any] = {}

    def _get_client_for_key(self, api_key: str):
        if api_key not in self._instances:
            from langchain_openai import ChatOpenAI

            self._instances[api_key] = ChatOpenAI(
                model=self.model,
                api_key=api_key,
                base_url=self.base_url,
                default_headers={
                    "HTTP-Referer": "https://fabric-atlas.dev",
                    "X-Title": "Fabric Atlas",
                },
            )
        return self._instances[api_key]

    @property
    def current_client(self):
        key = self.keys[self._current_index % len(self.keys)]
        return self._get_client_for_key(key)

    def invoke(self, input_data: Any, *args, **kwargs) -> Any:
        attempts = len(self.keys)
        last_error = None

        for _ in range(attempts):
            client = self.current_client
            try:
                return client.invoke(input_data, *args, **kwargs)
            except Exception as exc:
                last_error = exc
                err_msg = str(exc).lower()
                # Rotate key on rate-limit, 429, quota exhaustion, or invalid auth
                if any(tag in err_msg for tag in ("429", "rate limit", "quota", "credits", "unauthorized", "401")):
                    self._current_index = (self._current_index + 1) % len(self.keys)
                    continue
                raise

        raise RuntimeError(
            f"All {attempts} OpenRouter API key(s) failed for model '{self.model}'. Last error: {last_error}"
        ) from last_error

    def __getattr__(self, name: str) -> Any:
        return getattr(self.current_client, name)


class GenericHttpChatModel:
    """Lightweight zero-dependency ChatModel compatible with OpenRouter, Ollama, OpenAI, and Anthropic.
    Ensures model resolution and execution work even if optional LangChain integration packages are omitted.
    """

    def __init__(
        self,
        model: str,
        api_key: str = "",
        base_url: str = "https://openrouter.ai/api/v1",
        provider: str = "openrouter",
        default_headers: Optional[dict] = None,
    ):
        self.model = model
        self.model_name = model
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.provider = provider
        self.default_headers = default_headers or {}

    def invoke(self, input_data: Any, *args, **kwargs) -> Any:
        import json

        if isinstance(input_data, str):
            messages = [{"role": "user", "content": input_data}]
        elif isinstance(input_data, list):
            messages = []
            for m in input_data:
                if isinstance(m, dict):
                    messages.append(m)
                elif hasattr(m, "content"):
                    role = getattr(m, "type", "user")
                    if role == "human":
                        role = "user"
                    elif role == "ai":
                        role = "assistant"
                    messages.append({"role": role, "content": str(m.content)})
                else:
                    messages.append({"role": "user", "content": str(m)})
        else:
            messages = [{"role": "user", "content": str(input_data)}]

        url = f"{self.base_url}/chat/completions"
        headers = {"Content-Type": "application/json", **self.default_headers}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
        }

        # OpenRouter-specific fallback model routing
        if self.provider == "openrouter":
            if fallbacks := os.getenv("OPENROUTER_FALLBACK_MODELS"):
                fb_list = [m.strip() for m in fallbacks.split(",") if m.strip()]
                payload["models"] = [self.model] + [m for m in fb_list if m != self.model]

        req = urllib.request.Request(
            url, data=json.dumps(payload).encode("utf-8"), headers=headers
        )
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choice = data.get("choices", [{}])[0]
            content = choice.get("message", {}).get("content", "")

            class AIMessage:
                def __init__(self, text: str):
                    self.content = text
                    self.type = "ai"

                def __str__(self) -> str:
                    return self.content

            return AIMessage(content)


def _make(provider: str, model: str):
    if provider == "openrouter":
        keys = get_openrouter_keys()
        if not keys:
            raise ValueError("No OpenRouter API key configured (set OPENROUTER_API_KEY or OPENROUTER_API_KEYS)")
        
        # Check if free-tier only is enforced
        if os.getenv("OPENROUTER_FREE_TIER", "0") == "1" and not model.endswith(":free"):
            # Redirect to verified free variant if free tier is mandated
            free_models = [
                "google/gemini-2.0-flash-exp:free",
                "meta-llama/llama-3.3-70b-instruct:free",
                "deepseek/deepseek-r1:free",
                "qwen/qwen-2.5-coder-32b-instruct:free",
            ]
            model = free_models[0]

        if len(keys) == 1:
            try:
                from langchain_openai import ChatOpenAI

                return ChatOpenAI(
                    model=model,
                    api_key=keys[0],
                    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
                    default_headers={
                        "HTTP-Referer": "https://fabric-atlas.dev",
                        "X-Title": "Fabric Atlas",
                    },
                )
            except ImportError:
                return GenericHttpChatModel(
                    model=model,
                    api_key=keys[0],
                    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
                    provider="openrouter",
                    default_headers={
                        "HTTP-Referer": "https://fabric-atlas.dev",
                        "X-Title": "Fabric Atlas",
                    },
                )
        return OpenRouterRotatingChatModel(model=model, keys=keys)

    if provider == "anthropic_api":
        try:
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(model=model)
        except ImportError:
            return GenericHttpChatModel(
                model=model,
                api_key=os.getenv("ANTHROPIC_API_KEY", ""),
                base_url="https://api.anthropic.com/v1",
                provider="anthropic",
            )

    if provider == "openai":
        try:
            from langchain_openai import ChatOpenAI

            return ChatOpenAI(model=model)
        except ImportError:
            return GenericHttpChatModel(
                model=model,
                api_key=os.getenv("OPENAI_API_KEY", ""),
                base_url="https://api.openai.com/v1",
                provider="openai",
            )

    if provider == "google":
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI

            return ChatGoogleGenerativeAI(model=model)
        except ImportError:
            return GenericHttpChatModel(
                model=model,
                api_key=os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", ""),
                base_url="https://generativelanguage.googleapis.com/v1beta",
                provider="google",
            )

    if provider == "local":
        ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
        # Try native langchain_ollama if present
        try:
            from langchain_ollama import ChatOllama

            return ChatOllama(model=model, base_url=ollama_host)
        except ImportError:
            try:
                from langchain_openai import ChatOpenAI

                local_url = os.getenv("LOCAL_OPENAI_URL", f"{ollama_host.rstrip('/')}/v1")
                return ChatOpenAI(
                    model=model,
                    base_url=local_url,
                    api_key=os.getenv("LOCAL_API_KEY", "ollama"),
                )
            except ImportError:
                local_url = os.getenv("LOCAL_OPENAI_URL", f"{ollama_host.rstrip('/')}/v1")
                return GenericHttpChatModel(
                    model=model,
                    api_key=os.getenv("LOCAL_API_KEY", "ollama"),
                    base_url=local_url,
                    provider="local",
                )

    raise ValueError(f"unknown provider {provider}")


def clear_resolver_cache() -> None:
    """Clear memoized resolver cache for testing and runtime env switches."""
    resolve.cache_clear()


@lru_cache(maxsize=None)
def resolve(tier: str) -> tuple[str, str]:
    """Return (provider, model_id) for a tier, honoring provider_order + credentials."""
    reg = _registry()

    # Allow environment override for provider order
    if env_order := os.getenv("LANGGRAPH_PROVIDER_ORDER"):
        order = [p.strip() for p in env_order.split(",") if p.strip()]
    else:
        order = reg["tools"]["langgraph"]["provider_order"]

    tiers = reg["tiers"]
    if tier not in tiers:
        raise KeyError(f"tier '{tier}' not in models.yaml")

    for provider in order:
        env_vars = _PROVIDER_ENV.get(provider)
        if env_vars:
            # If provider requires specific keys, ensure at least one is present
            if isinstance(env_vars, list):
                if not any(os.getenv(v) for v in env_vars):
                    continue
            elif not os.getenv(env_vars):
                continue
        elif provider == "local":
            # If strict local probe is requested or active, verify local endpoint connectivity
            probe_strict = os.getenv("LANGGRAPH_PROBE_LOCAL", "0") == "1"
            if probe_strict and not is_local_available():
                continue

        for model in tiers[tier].get(provider, []):
            try:
                _make(provider, model)  # instantiation validates model structure lazily
                return provider, model
            except Exception:
                continue  # fall through candidate list

    raise RuntimeError(
        f"No available model for tier '{tier}'. Check API keys/local endpoint and models.yaml candidates."
    )


def get_llm(
    tier: Optional[str] = None,
    task: Optional[str] = None,
    provider: Optional[str] = None,
    model: Optional[str] = None,
):
    """Resolve a tier or task to a ready chat model instance.

    Pass provider & model directly to bypass tier resolution.
    """
    if provider and model:
        return _make(provider, model)

    if tier is None:
        if task is None:
            raise ValueError("pass tier=, task=, or both provider= and model=")
        tier = _registry()["tasks"].get(task, "standard")

    resolved_provider, resolved_model = resolve(tier)
    return _make(resolved_provider, resolved_model)

