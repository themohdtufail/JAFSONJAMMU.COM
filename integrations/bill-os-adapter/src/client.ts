export interface SendResult { eventId: string | null; status: string; reason?: string; detail?: string; discrepancies?: number }

/** HTTP client for the JAFSON sync API. It speaks only the public integration endpoints; nothing here touches the commerce database. */
export function createClient(o: { baseUrl: string; apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch }) {
  const f = o.fetchImpl ?? fetch, base = o.baseUrl.replace(/\/$/, "");
  const call = async (path: string, body?: unknown) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), o.timeoutMs ?? 15_000);
    try {
      const r = await f(`${base}/v1/integrations/bill-os${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${o.apiKey}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
      const j = (await r.json().catch(() => null)) as { success?: boolean; data?: any; error?: { code?: string; message?: string } } | null;
      if (!r.ok || !j?.success) throw Object.assign(new Error(j?.error?.message ?? `HTTP ${r.status}`), { status: r.status, code: j?.error?.code });
      return j.data;
    } finally { clearTimeout(t); }
  };
  return {
    sendEvents: (events: unknown[]): Promise<{ results: SendResult[] }> => call("/events", { events }),
    heartbeat: () => call("/heartbeat", {}),
    status: () => call("/events/status"),
  };
}
