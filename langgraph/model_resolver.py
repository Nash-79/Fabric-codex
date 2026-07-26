"""
model_resolver.py — runtime tier->model resolution for the optional LangGraph orchestrator.

Reads ../.ucp/models.yaml, walks provider_order, returns the first model that
(a) has credentials configured and (b) instantiates successfully. Caches per tier.
A new model release = edit models.yaml (or nothing, if aliases cover it); no code change.

Usage inside orchestrator.py:

    from model_resolver import get_llm
    llm = get_llm("reasoning")               # -> a ready LangChain chat model
    llm = get_llm(task="solution_architecture")  # -> tier looked up from tasks: mapping
"""

import os
from functools import lru_cache
from pathlib import Path

import yaml

REGISTRY = Path(__file__).resolve().parent.parent / ".ucp" / "models.yaml"

_PROVIDER_ENV = {
    "anthropic_api": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "google": "GEMINI_API_KEY",
    "local": None,  # Ollama needs no key
}


def _registry():
    return yaml.safe_load(REGISTRY.read_text())


def _make(provider: str, model: str):
    if provider == "anthropic_api":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model)
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model)
    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model)
    if provider == "local":
        from langchain_ollama import ChatOllama
        return ChatOllama(model=model)
    raise ValueError(f"unknown provider {provider}")


@lru_cache(maxsize=None)
def resolve(tier: str) -> tuple[str, str]:
    """Return (provider, model_id) for a tier, honoring provider_order + credentials."""
    reg = _registry()
    order = reg["tools"]["langgraph"]["provider_order"]
    tiers = reg["tiers"]
    if tier not in tiers:
        raise KeyError(f"tier '{tier}' not in models.yaml")
    for provider in order:
        env = _PROVIDER_ENV.get(provider)
        if env and not os.getenv(env):
            continue
        for model in tiers[tier].get(provider, []):
            try:
                _make(provider, model)  # instantiation validates model id lazily
                return provider, model
            except Exception:
                continue  # fall through the chain
    raise RuntimeError(f"No available model for tier '{tier}'. "
                       f"Check API keys and models.yaml candidates.")


def get_llm(tier: str | None = None, task: str | None = None):
    """Resolve a tier (directly or via task mapping) to a ready chat model."""
    if tier is None:
        if task is None:
            raise ValueError("pass tier= or task=")
        tier = _registry()["tasks"].get(task, "standard")
    provider, model = resolve(tier)
    return _make(provider, model)
