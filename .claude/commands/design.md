---
description: Author a cited Fabric solution architecture from verified claims (local, no API).
argument-hint: <scenario description>
---
Use the **solution-architect** subagent to design for: $ARGUMENTS

Ask for any missing key constraints once, fetch verified claims directly from Supabase with the
anon key (no `localhost:8000` backend — see the solution-architect agent for the `$SB`/header
recipe), write the architecture yourself with [Sn] citations into `content/designs/<slug>.json`
(`body_md` + portable `cited_source_keys`), and optionally hand off to diagram-author for an
original diagram. **Publishing is a human step**: tell the user to open **Settings → Publish →
Design** and paste the JSON (agents have no Supabase write access). Label inference vs cited fact.
Finish by suggesting `/validate <slug>` on the draft and the server-side validate action after
publishing.
