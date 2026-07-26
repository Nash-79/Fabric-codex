"""
orchestrator.py — optional LangGraph reference orchestrator for Fabric Atlas.

NOT wired into the app, any script, or CI. Fabric Atlas's default workflow is the
Claude Code / Codex subagent roster in .claude/agents/ and .codex/agents/, driven from
the IDE (see ../CLAUDE.md, ../AGENTS.md). This module is scaffolding for a *future*
automated, outside-the-IDE pipeline (e.g. a scheduled content run) that would need a
real Python control loop instead of a human driving subagents turn by turn — it is not
required for, and does not replace, that existing workflow.

It intentionally mirrors the shape of content-orchestrator.md's planning role (snapshot
state -> route work -> human gate) but as a real StateGraph instead of a prompt. Node
bodies here are stubs: wire them to the same Supabase REST reads the Claude Code agents
already document (see e.g. content-orchestrator.md's "Data access" section) before this
is runnable against a real Fabric Atlas KB.

Diagram generation: if a future node in this graph authors diagrams, it must follow
../.claude/agents/diagram-author.md's contract (SVG + mandatory sidecar, evidence
citations, official-icon policy) — do not introduce a second diagram-quality standard.

Two structural fixes applied from the start (ported from the upstream UCP kit's
langgraph_fixes.py, which patched an earlier buggy draft — this file has no separate
"broken" version to fix):

  1. add_conditional_edges mapping values must be NODE NAMES (strings). Router callables
     return the destination node name directly; a router must never itself carry the
     branching logic as unpicklable lambdas in the edge map.
  2. The clarification gate actually pauses for the user via interrupt() + a checkpointer.
     Without a checkpointer, interrupt() has nothing to suspend against and human-in-the-
     loop review is silently skipped.

Usage:

    python orchestrator.py   # runs one demo invocation, driving the interrupt() loop
                              # from the terminal (see __main__ below)
"""

from typing import Literal, TypedDict

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt, Command, Send

from model_resolver import get_llm


class AgentState(TypedDict, total=False):
    messages: list
    intent: dict
    ambiguity_score: float
    clarifying_questions: list
    user_responses: list
    current_agent: str
    track: str
    artifacts: dict
    quality_checks: dict
    next_step: str
    model: str
    model_provider: str


# ---------------------------------------------------------------------------
# Node bodies — stubs. Wire each to real work before use; see module docstring.
# ---------------------------------------------------------------------------

def supervisor_node(state: AgentState) -> AgentState:
    """Classify intent, score ambiguity, pick the next step/agent. Stub: always
    routes straight to SOLUTION_ARCHITECT for a single-domain demo run."""
    state.setdefault("intent", {"domain": "solution_architecture", "raw_request": ""})
    state["ambiguity_score"] = state.get("ambiguity_score", 0.0)
    state["current_agent"] = "SOLUTION_ARCHITECT"
    state["next_step"] = "EXECUTE"
    return state


def clarification_node(state: AgentState) -> AgentState:
    """Suspend the graph until the user answers the clarifying questions."""
    answers = interrupt({
        "type": "clarifying_questions",
        "questions": state["clarifying_questions"],
    })
    state["user_responses"] = answers if isinstance(answers, list) else [answers]

    combined = state["intent"].get("raw_request", "") + " " + " ".join(state["user_responses"])
    state["intent"]["refined_request"] = combined
    # Re-scoring the ambiguity score is left to a real intent-schema implementation;
    # a demo run just accepts the answers and proceeds.
    state["ambiguity_score"] = 0.0
    return state


def solution_architect_node(state: AgentState) -> AgentState:
    """Stub: resolve the model tier for this task and record it. A real
    implementation would call get_llm(...) with a grounded, cited prompt built the
    same way .claude/agents/solution-architect.md documents (Supabase claim reads,
    [Sn] citation legend) before writing content/designs/<slug>.json."""
    llm = get_llm(task="solution_architecture")
    state["model"] = getattr(llm, "model", getattr(llm, "model_name", "unknown"))
    state.setdefault("artifacts", {})["solution_architecture"] = "stub: not yet implemented"
    state["next_step"] = "DELIVER"
    return state


def knowledge_base_node(state: AgentState) -> AgentState:
    """Stub: placeholder for a future write-through to the same Supabase claims/
    capability graph the Claude Code agents already own — not a separate KB."""
    state.setdefault("artifacts", {})["knowledge_base"] = "stub: not yet implemented"
    state["next_step"] = "DELIVER"
    return state


def quality_gate_node(state: AgentState) -> AgentState:
    """Stub quality gate: always approves. A real gate would run the same checks
    validation-reviewer.md documents before marking DELIVER."""
    state["next_step"] = "DELIVER"
    return state


def synthesizer_node(state: AgentState) -> AgentState:
    state.setdefault("messages", []).append(
        {"role": "assistant", "content": str(state.get("artifacts", {}))}
    )
    return state


# ---------------------------------------------------------------------------
# Routers — return NODE NAMES (strings), never lambdas, per fix #1.
# ---------------------------------------------------------------------------

def route_from_supervisor(state: AgentState) -> str:
    if state["next_step"] == "CLARIFY":
        return "CLARIFY"
    if state["intent"].get("domain") == "multi_domain":
        return "FANOUT"
    return state["current_agent"]  # e.g. "SOLUTION_ARCHITECT"


def route_from_clarify(state: AgentState) -> str:
    if state["ambiguity_score"] <= 0.4 or len(state.get("user_responses", [])) >= 3:
        return state["current_agent"]
    return "CLARIFY"


def route_from_quality_gate(state: AgentState) -> str:
    return {"REVISION": state["current_agent"],
            "ROUTE_TO_SYNTHESIZER": "SYNTHESIZER",
            "DELIVER": "SYNTHESIZER"}[state["next_step"]]


def fanout_node(state: AgentState):
    """Dispatch sub-intents to specialists IN PARALLEL, converge at QUALITY_GATE."""
    return [
        Send("SOLUTION_ARCHITECT", {**state, "track": "solution"}),
        Send("KNOWLEDGE_BASE", {**state, "track": "kb"}),
    ]


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("SUPERVISOR", supervisor_node)
    workflow.add_node("CLARIFY", clarification_node)
    workflow.add_node("SOLUTION_ARCHITECT", solution_architect_node)
    workflow.add_node("KNOWLEDGE_BASE", knowledge_base_node)
    workflow.add_node("QUALITY_GATE", quality_gate_node)
    workflow.add_node("SYNTHESIZER", synthesizer_node)

    workflow.set_entry_point("SUPERVISOR")

    workflow.add_conditional_edges(
        "SUPERVISOR", route_from_supervisor,
        ["CLARIFY", "SOLUTION_ARCHITECT", "KNOWLEDGE_BASE"],
    )
    workflow.add_conditional_edges(
        "CLARIFY", route_from_clarify,
        ["CLARIFY", "SOLUTION_ARCHITECT", "KNOWLEDGE_BASE"],
    )
    for agent in ("SOLUTION_ARCHITECT", "KNOWLEDGE_BASE"):
        workflow.add_edge(agent, "QUALITY_GATE")
    workflow.add_conditional_edges(
        "QUALITY_GATE", route_from_quality_gate,
        ["SOLUTION_ARCHITECT", "KNOWLEDGE_BASE", "SYNTHESIZER"],
    )
    workflow.add_edge("SYNTHESIZER", END)

    # Checkpointer is REQUIRED for interrupt() to work, per fix #2. Swap MemorySaver
    # for SqlitePostgresSaver/PostgresSaver in anything beyond local experiments.
    return workflow.compile(checkpointer=MemorySaver())


# ---------------------------------------------------------------------------
# Driving the interrupt loop (usage / smoke test)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    graph = build_graph()
    config = {"configurable": {"thread_id": "demo-session-001"}}

    result = graph.invoke(
        {"messages": [], "current_agent": "SUPERVISOR", "intent": {},
         "ambiguity_score": 0.0, "clarifying_questions": [], "user_responses": [],
         "artifacts": {}, "quality_checks": {}, "next_step": "", "model": "auto"},
        config,
    )

    while "__interrupt__" in result:
        payload = result["__interrupt__"][0].value
        print("Agent asks:")
        for q in payload["questions"]:
            print(" -", q)
        answers = [input(f"> {q}\n") for q in payload["questions"]]
        result = graph.invoke(Command(resume=answers), config)

    print(result["messages"][-1]["content"] if result["messages"] else result["artifacts"])
