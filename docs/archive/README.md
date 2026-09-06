# Archive

Completed or superseded planning documents, kept because they record **why** decisions were made —
not because they describe the system as it is today.

**Nothing here is current.** For how the system works now, start at [../README.md](../README.md).

| Document | What it was | Status |
|---|---|---|
| [analysis-and-modernisation.md](analysis-and-modernisation.md) | Deployment analysis written while the app was Lovable-hosted | **Superseded.** The Cloudflare migration is done; see [../deployment.md](../deployment.md). Its `backend/` and `frontend/` references describe directories that no longer exist. |
| [diagram-revamp-plan.md](diagram-revamp-plan.md) | The plan behind the authored-SVG contract and semantic sidecars | **Delivered.** The contract it describes is live and enforced by `validate:diagrams`. |
| [plan/](plan/) | Multi-phase plan for turning the reference encyclopedia into a learning portal | **Partly delivered**, and its status headers are stale. Useful for the reasoning behind the curriculum and content model. |

## Why keep them

A plan that shipped still answers questions the finished code cannot: which alternatives were
weighed, what was deliberately left out, and what the constraints were at the time. Deleting them
loses that and keeps nothing worth having.

They are archived rather than updated because maintaining a completed plan as though it were
current is how documentation starts lying. If something here contradicts the live docs, the live
docs win.
