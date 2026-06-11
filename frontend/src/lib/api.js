export async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
      // Structured 409 details (e.g. queue duplicates) carry a message field.
      if (detail && typeof detail === "object") detail = detail.message || JSON.stringify(detail);
    } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json();
}
