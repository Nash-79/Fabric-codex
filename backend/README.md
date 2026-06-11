# Fabric Atlas — backend

FastAPI + SQLModel. Owns claim versioning and the validation pass.

## Run

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate        # Windows;  . .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env            # set ANTHROPIC_API_KEY for the LLM steps
uvicorn app.main:app --reload
```

- Interactive API docs: http://localhost:8000/docs
- SQLite file `fabric_atlas.db` is created on first run. Delete it to reset.
- No API key? The app still runs. Versioning, citation and freshness validators work; the
  extraction, generation, grounding/coverage/antipattern, and lesson steps return a clear 503.

## Run from the repo root (so `app` imports resolve)

`uvicorn` is run from inside `backend/`. If you script against services directly, set
`PYTHONPATH=.` from the `backend/` directory.

## API map

| Method | Path                              | Purpose                                          |
|--------|-----------------------------------|--------------------------------------------------|
| POST   | /sources/ingest                   | Ingest a source (local: pre-built `claims`+`assets`+`tags`+reader metadata) |
| GET    | /sources                          | List source revisions with tags and reader metadata |
| POST   | /sources/{source_key}/drift       | Re-ingest (pre-built `claims`), diff, supersede  |
| GET    | /claims?capability=&status=&tag=  | List active claims (filterable, incl. by tag)    |
| GET    | /claims/{claim_key}/history       | Full version chain for a claim                   |
| POST   | /claims/{claim_id}/verify         | Approve a pending claim                          |
| GET    | /tags                             | Tag counts across active claims                  |
| GET    | /coverage                         | Claim counts per capability × depth              |
| POST   | /assets                           | Register an asset (referenced or generated)      |
| GET    | /assets?source=&design=&capability= | List assets                                    |
| POST   | /designs                          | Persist an agent-authored design (local mode)    |
| POST   | /designs/generate                 | Generate server-side (LLM_MODE=api only)         |
| GET    | /designs, /designs/{id}           | List / fetch designs (with tags + assets)        |
| POST   | /designs/{id}/validate            | Validation pass (local: accepts agent `issues`)  |
| GET    | /designs/{id}/validations         | Past validation runs + issues                    |
| POST   | /lessons/generate                 | Lesson generation (LLM_MODE=api only)            |

## Tests

A quick way to exercise versioning without a key:

```bash
PYTHONPATH=. python -c "from app.db import init_db; init_db(); print('db ok')"
```

See `docs/data-model.md` for the version-chain and validation semantics.
