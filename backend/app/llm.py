"""Anthropic wrapper + structured-output helpers.

Every LLM step is funnelled through here so prompts and guardrails live in one place.
If ANTHROPIC_API_KEY is unset, LLM steps raise LLMUnavailable — callers catch this and
the deterministic parts of the system (versioning, citation/freshness validation) keep working.
"""
from __future__ import annotations
import json
from typing import Optional
from app.db import ANTHROPIC_API_KEY, ANTHROPIC_MODEL

CAPABILITY_IDS = [
    "fabric-platform",
    "onelake", "lakehouse", "warehouse", "polaris", "direct-lake", "semantic-model",
    "power-bi", "data-factory", "dataflow-gen2", "spark", "rti", "eventhouse-kql",
    "sql-database", "mirroring", "fabric-data-agent", "fabric-iq", "graphql-api",
    "purview", "capacity",
]


class LLMUnavailable(RuntimeError):
    pass


def _client():
    if not ANTHROPIC_API_KEY:
        raise LLMUnavailable("ANTHROPIC_API_KEY is not set; LLM steps are disabled.")
    import anthropic  # imported lazily so the app starts without the key
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def _complete(system: str, prompt: str, max_tokens: int = 2048) -> str:
    msg = _client().messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")


def _parse_json(text: str):
    t = text.replace("```json", "").replace("```", "").strip()
    # tolerate prose around the JSON
    for open_ch, close_ch in (("[", "]"), ("{", "}")):
        a, b = t.find(open_ch), t.rfind(close_ch)
        if a != -1 and b != -1 and b > a:
            try:
                return json.loads(t[a:b + 1])
            except json.JSONDecodeError:
                continue
    return json.loads(t)


# ---------------------------------------------------------------- extraction
_EXTRACT_SYS = (
    "You are a knowledge curator for a Microsoft Fabric architecture platform. Extract discrete, "
    "atomic technical claims from the source. Paraphrase fully in your own words — never copy "
    "sentences; any unavoidable quoted phrase must be under 15 words. Tag each claim to ONE "
    "capabilityId from the provided list, a depth level 1-5 (1 conceptual, 2 practitioner, "
    "3 architect, 4 performance, 5 internals), and a type (fact | pattern | antipattern | internal). "
    "Return ONLY a JSON array, no prose, no fences: "
    '[{"capabilityId":"...","text":"...","depth":1,"type":"fact"}]. Return the 6-12 most important claims.'
)


def extract_claims(content: str) -> list[dict]:
    prompt = "Capabilities:\n" + "\n".join(CAPABILITY_IDS) + "\n\nSource text:\n\"\"\"" + content[:12000] + "\"\"\""
    arr = _parse_json(_complete(_EXTRACT_SYS, prompt, max_tokens=2500))
    out = []
    for x in arr:
        cid = x.get("capabilityId") or x.get("capability_id")
        if cid in CAPABILITY_IDS and x.get("text"):
            out.append({
                "capability_id": cid,
                "text": x["text"].strip(),
                "depth": max(1, min(5, int(x.get("depth", 1)))),
                "type": x.get("type", "fact"),
            })
    return out


# --------------------------------------------------------------- generation
_DESIGN_SYS = (
    "You are a senior Microsoft Fabric solution architect. Design a grounded architecture using the "
    "verified knowledge claims as your factual basis. Cite claims inline as [S<n>] where you rely on "
    "them. Clearly label anything that is your own inference vs a cited fact. State assumptions "
    "explicitly. Do not invent product limits or roadmap claims. Use markdown with sections: "
    "## Recommended architecture, ## Data flow, ## Component responsibilities, ## Performance, "
    "## Governance & security, ## Cost & capacity, ## Risks & anti-patterns, ## Assumptions, "
    "## Open questions."
)


def generate_architecture(scenario: str, constraints: dict, claim_context: str, legend: str) -> str:
    prompt = (
        f"Scenario:\n{scenario}\n\nConstraints:\n{json.dumps(constraints, indent=2)}\n\n"
        f"Verified knowledge base (cite with the bracket tags):\n{claim_context}\n\n"
        f"Source legend:\n{legend}"
    )
    return _complete(_DESIGN_SYS, prompt, max_tokens=4000)


# --------------------------------------------------------------- validation
_REVIEW_SYS = (
    "You are an architecture assurance reviewer for Microsoft Fabric. You receive a design and the "
    "claims it was grounded on. Find problems only — do not rewrite. Return ONLY a JSON object: "
    '{"issues":[{"validator":"grounding|coverage|antipattern","severity":"critical|warning|info",'
    '"message":"...","ref":"..."}]}. '
    "grounding: a statement does not follow from any provided claim, or contradicts one. "
    "coverage: a capability the scenario clearly needs is missing from the design. "
    "antipattern: a known Fabric bad practice is present. Be specific and concise; no false positives."
)


def review_design(design_md: str, scenario: str, claim_context: str) -> list[dict]:
    prompt = f"Scenario:\n{scenario}\n\nClaims provided:\n{claim_context}\n\nDesign:\n{design_md}"
    obj = _parse_json(_complete(_REVIEW_SYS, prompt, max_tokens=2000))
    issues = obj.get("issues", []) if isinstance(obj, dict) else []
    valid = {"grounding", "coverage", "antipattern"}
    sev = {"critical", "warning", "info"}
    return [
        {"validator": i.get("validator", "grounding"), "severity": i.get("severity", "warning"),
         "message": i.get("message", ""), "ref": i.get("ref", "")}
        for i in issues
        if i.get("validator") in valid and i.get("severity") in sev and i.get("message")
    ]


# ------------------------------------------------------------------ lessons
_LESSON_SYS = (
    "You are a Microsoft Fabric instructor. Using ONLY the provided grounded claims, write a concise "
    "lesson for a {level} learner about {capability}. Cite claims as [S<n>]. Use markdown with a plain "
    "explanation, one concrete worked example, and a short 'What goes wrong' list. Keep under ~400 "
    "words. Do not add facts beyond the claims."
)


def write_lesson(capability: str, level: str, claim_context: str) -> str:
    system = _LESSON_SYS.format(level=level, capability=capability)
    return _complete(system, f"Grounded claims:\n{claim_context}", max_tokens=2000)
