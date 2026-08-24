/**
 * Keyset cursor encoding for the paginated content library (WP3.2).
 *
 * Kept as a standalone pure module (like `content-siblings` / `learning-path-ui`) so the paging
 * boundary logic is unit-testable without a Supabase client.
 *
 * Two cursor shapes share one opaque token, because the caller cannot know which backend served
 * the page and must not have to care:
 *   - keyset  `{ updatedAt, id }` — the Supabase path, ordered by (updated_at DESC, id DESC)
 *   - offset  `{ offset }`        — the bundled-content fallback, which has no stable sort key
 *
 * Tokens are opaque on purpose: base64url of compact JSON. This is a paging hint, not a security
 * boundary — every filter is re-applied server-side on the next page, so a tampered cursor can
 * only move the reader's own window, never widen what they are allowed to see.
 */

export type ContentCursor =
  | { updatedAt: string; id: string; offset?: undefined }
  | { offset: number; updatedAt?: undefined; id?: undefined };

function toBase64Url(raw: string): string {
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(raw, "utf8").toString("base64")
      : btoa(unescape(encodeURIComponent(raw)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(token: string): string {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  return typeof Buffer !== "undefined"
    ? Buffer.from(b64, "base64").toString("utf8")
    : decodeURIComponent(escape(atob(b64)));
}

export function encodeContentCursor(cursor: ContentCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

/**
 * Decode a cursor token. Returns `null` for anything unusable — absent, malformed, or
 * structurally wrong — so a stale or hand-edited token degrades to "start from the beginning"
 * rather than throwing a 500 at the reader.
 */
export function parseContentCursor(token?: string | null): ContentCursor | null {
  if (!token) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const c = parsed as Record<string, unknown>;
    if (typeof c.updatedAt === "string" && typeof c.id === "string" && c.updatedAt && c.id) {
      return { updatedAt: c.updatedAt, id: c.id };
    }
    if (typeof c.offset === "number" && Number.isInteger(c.offset) && c.offset >= 0) {
      return { offset: c.offset };
    }
    return null;
  } catch {
    return null;
  }
}

type PageRow = { id: string; updated_at?: string | null };

/**
 * Split an over-fetched result (pageSize + 1 rows) into the page the caller keeps and the cursor
 * that reaches the next one. A short read means this was the last page, so the cursor is null.
 */
export function buildContentPage<T extends PageRow>(
  rows: T[],
  pageSize: number,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last?.updated_at
      ? encodeContentCursor({ updatedAt: last.updated_at, id: last.id })
      : null;
  return { items, nextCursor };
}
