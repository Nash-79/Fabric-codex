#!/usr/bin/env python3
"""
sync_models.py — resolve capability tiers to currently-available models and rewrite
tool-native config files. Run manually, on model-release news, or in CI.

    python scripts/sync_models.py            # probe APIs (uses env keys), rewrite files
    python scripts/sync_models.py --dry-run  # show what would change
    python scripts/sync_models.py --offline  # skip API probes, trust models.yaml order

Rewrites:
  .claude/agents/*.md          -> model: <alias per x-ucp-tier>
  .github/chatmodes/*.md       -> model: <copilot display name per tier, or Auto>

Deliberately does NOT touch ~/.codex/config.toml: that file is the user's personal,
cross-project Codex CLI preference (model choice, sandbox mode, trusted-project list),
not something scoped to this repo. The repo's own .codex/agents/*.toml carry no
per-agent model field to rewrite either — Codex CLI has no per-agent model pin today.

Availability probes (all optional, key-gated):
  ANTHROPIC_API_KEY -> GET https://api.anthropic.com/v1/models
  OPENAI_API_KEY    -> GET https://api.openai.com/v1/models
  GEMINI_API_KEY    -> GET https://generativelanguage.googleapis.com/v1beta/models

Fabric Atlas is Claude-only in production (Claude Code + Codex agents; no LangGraph
orchestrator serves the app). This script's OpenAI/Google candidates and the Copilot
chatmode pass exist for optional cross-editor use (`langgraph/`, `.github/chatmodes/`)
and never touch anything the app itself serves.
"""

import argparse, json, os, re, sys, urllib.request
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("pip install pyyaml")

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / ".ucp" / "models.yaml"


def fetch_json(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def probe_available():
    """Return {provider_key: set(model_ids)} for providers we have keys for."""
    avail = {}
    if k := os.getenv("ANTHROPIC_API_KEY"):
        try:
            data = fetch_json("https://api.anthropic.com/v1/models",
                              {"x-api-key": k, "anthropic-version": "2023-06-01"})
            avail["anthropic_api"] = {m["id"] for m in data.get("data", [])}
        except Exception as e:
            print(f"  ! anthropic probe failed: {e}")
    if k := os.getenv("OPENAI_API_KEY"):
        try:
            data = fetch_json("https://api.openai.com/v1/models",
                              {"Authorization": f"Bearer {k}"})
            avail["openai"] = {m["id"] for m in data.get("data", [])}
        except Exception as e:
            print(f"  ! openai probe failed: {e}")
    if k := os.getenv("GEMINI_API_KEY"):
        try:
            data = fetch_json(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={k}", {})
            avail["google"] = {m["name"].split("/")[-1] for m in data.get("models", [])}
        except Exception as e:
            print(f"  ! gemini probe failed: {e}")
    return avail


def resolve(reg, tier, provider, avail):
    """First candidate that is available (fuzzy prefix match); else first candidate."""
    candidates = reg["tiers"].get(tier, {}).get(provider, [])
    if not candidates:
        return None
    pool = avail.get(provider)
    if pool:
        for c in candidates:
            hits = sorted(m for m in pool if m == c or m.startswith(c))
            if hits:
                return hits[-1]  # latest matching version wins
        print(f"  ! no {provider} candidate for tier '{tier}' available; "
              f"keeping '{candidates[0]}' — UPDATE models.yaml")
    return candidates[0]


FRONTMATTER = re.compile(r"^---\n(.*?)\n---", re.S)


def rewrite_frontmatter_model(path: Path, new_model: str, dry: bool) -> bool:
    text = path.read_text(encoding="utf-8")
    m = FRONTMATTER.search(text)
    if not m:
        return False
    fm = m.group(1)
    new_fm, n = re.subn(r"(?m)^model:\s*.*$", f"model: {new_model}", fm)
    if n == 0:
        new_fm = fm + f"\nmodel: {new_model}"
    if new_fm == fm:
        return False
    print(f"  {path.relative_to(ROOT)} -> model: {new_model}")
    if not dry:
        path.write_text(text.replace(fm, new_fm, 1), encoding="utf-8")
    return True


def tier_of(path: Path, reg, default="standard"):
    """Prefer an explicit x-ucp-tier frontmatter line; fall back to the models.yaml
    `agents:` map keyed by filename stem (covers files that predate the tier line)."""
    text = path.read_text(encoding="utf-8")
    m = re.search(r"(?m)^x-ucp-tier:\s*(\S+)", text)
    if m:
        return m.group(1)
    return reg.get("agents", {}).get(path.stem, default)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()
    dry = args.dry_run

    reg = yaml.safe_load(REGISTRY.read_text())
    avail = {} if args.offline else probe_available()
    changed = 0

    # 1. Claude Code subagents — aliases (auto-tracking); tier -> alias name
    print("Claude Code subagents:")
    for f in sorted((ROOT / ".claude" / "agents").glob("*.md")):
        tier = tier_of(f, reg)
        alias = resolve(reg, tier, "anthropic", {})  # aliases: no probe needed
        if alias:
            changed += rewrite_frontmatter_model(f, alias, dry)

    # 2. Gemini subagents — Google models per tier
    print("Gemini subagents:")
    for f in sorted((ROOT / ".gemini" / "agents").glob("*.md")):
        tier = tier_of(f, reg)
        model = resolve(reg, tier, "google", avail)
        if model:
            changed += rewrite_frontmatter_model(f, model, dry)

    # 3. Copilot chat modes — display names from registry, fallback Auto
    print("Copilot chat modes:")
    names = reg["tools"]["copilot_chatmodes"]["copilot_display_names"]
    for f in sorted((ROOT / ".github" / "chatmodes").glob("*.chatmode.md")):
        tier = tier_of(f, reg)
        changed += rewrite_frontmatter_model(f, names.get(tier, names["fallback"]), dry)

    print(f"\n{'Would change' if dry else 'Changed'} {changed} file(s).")
    if not avail and not args.offline:
        print("No provider keys found — resolution used models.yaml order only. "
              "Export API keys to probe real availability.")


if __name__ == "__main__":
    main()
