## Modernise the Advisor with AI Elements

Rebuild the Advisor chat surface on top of the AI Elements primitives (per the chat-ui-composition contract) and fix the mobile/desktop topology so the composer, transcript, and header behave like a real chat app instead of a stack of scrolling cards.

### Problems today
- Mobile: the header (title + paragraph + 5 chip row + 3 chip row) eats the top ~40% of the viewport, pushing starter cards and the composer below the fold. Because the transcript is a middle scroll pane, the empty starter state opens *pre-scrolled*, cutting off the first card.
- Composer sits inside its own footer band with a big empty gap above it; visually detached from the transcript.
- Chat header mixes hero copy, model selector, tier chip, sources toggle, clear, history — no hierarchy, wraps unpredictably.
- No AI Elements components used (Conversation, Message, MessageContent, MessageResponse, PromptInput, Shimmer, Tool). Custom `AdvisorComposer` / `AdvisorMessage` re-implement AI Elements badly.
- Assistant messages render inside a bordered card (bubble) — contract says no background on assistant messages.

### Plan

1. **Install AI Elements** (`bun x ai-elements@latest add conversation message prompt-input shimmer`). Keep existing markdown/code/mermaid renderers by passing them to `MessageResponse` / message content children.

2. **Collapse the header into a compact toolbar.** One row only:
   - Left: sidebar toggle + "Ask Fabric Atlas" title (truncates on mobile).
   - Right: model select (icon+label, condensed), Sources toggle, overflow menu (Clear, tier badge, retrieval-status dot).
   - Move the hero paragraph ("Answers retrieve verified claims…") into the empty state next to the starter cards, not the persistent header. Move `RAG over all Atlas content` / `Ready` / contextSummary chips into a slim status strip *inside* the empty state, and into the `Shimmer` line while streaming — not always-visible.
   - Result on mobile: header height drops from ~260px to ~56px, starter cards visible on first paint.

3. **Rebuild the chat surface with AI Elements.**
   - `Conversation` + `ConversationContent` + `ConversationScrollButton` replace the custom scrollRef + smooth-scroll effect.
   - `Message` + `MessageContent` + `MessageResponse` for user/assistant rendering. Assistant: no background, plain foreground on page. User: filled bubble using `primary` / `primary-foreground` tokens.
   - `Shimmer` ("Thinking…", "Retrieving claims…") replaces the custom three-dot pulse and the "Retrieving verified claims…" card.
   - Keep `AdvisorMessage`'s citation footnotes/actions but render them through `MessageContent` children so copy/retry sit as message actions.

4. **Rebuild the composer with `PromptInput`.**
   - `PromptInput` → `PromptInputTextarea` → `PromptInputFooter` (justify-end) → `PromptInputSubmit` (icon-sm) with `status`/`disabled`/`onStop` wired from `useChat`.
   - Remove the outer bordered footer band; float the composer directly under the transcript with `max-w-3xl` centering and safe-area bottom padding.
   - Focus textarea on mount, after send, and after switching threads.

5. **Sources panel + sidebar polish (topology only, no behavior change).**
   - Keep the three-column shell `[sidebar | transcript | sources]`, but make the transcript column a real flex column with the composer as its last child so there is no floating footer band.
   - Use `grid-cols-[minmax(0,1fr)_auto]` for the toolbar row per responsive-layout-patterns; `min-w-0` on the title cell, `shrink-0` on controls.
   - Mobile: sources panel becomes a `Sheet` (right) triggered by the Sources button; drop the desktop grid switch on small screens.

6. **Empty state redesign.**
   - Centered card stack: agent identity (already-generated Fabric mark, not `Sparkles`), one-line pitch, 2×2 starter grid, tiny "grounded in verified claims" caption. All fits above the fold on 430px.

### Technical notes
- No API/route changes. `/api/chat`, `useChat`, transport, thread storage all unchanged.
- `AdvisorComposer`, `AdvisorMessage` become thin wrappers over AI Elements primitives; delete the custom textarea auto-resize and pulse-dot code once `PromptInputTextarea` / `Shimmer` are in.
- Preserve existing `AdvisorSourcePanel`, `AdvisorMermaidBlock`, `AdvisorCodeBlock`, citation logic, thread history, and localStorage keys.
- Type-check with `bunx tsgo --noEmit`; verify with mobile (430) + desktop (1280) screenshots that (a) starter cards visible on first paint, (b) composer sits flush at the bottom with no empty band, (c) assistant messages have no bubble background, (d) user bubble uses primary/primary-foreground.

### Out of scope
- Backend / retrieval / model list changes.
- Thread persistence shape (stays localStorage-per-thread as today).
- Sources panel content redesign (only its container becomes a Sheet on mobile).