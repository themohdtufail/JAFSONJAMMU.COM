"use client";
import { useState } from "react";
import { adm, label, msg, when } from "@/lib/api";
import { PageHead, useAdmin, useLoad } from "@/components/Shell";

interface N { id: string; channel: string; recipient: string; template: string; status: string; attempts: number; lastError: string | null; createdAt: string; sentAt: string | null }
interface R { counts: Record<string, number>; providers: { sms: string; email: string }; items: N[] }
const tone = (s: string) => (s === "SENT" ? "ok" : s === "FAILED" ? "bad" : "warn");

export default function Messages() {
  const { can, toast } = useAdmin(); const [only, setOnly] = useState(""); const { data, err, reload } = useLoad(() => (can("MANAGER") ? adm<R>(`/admin/notifications${only ? `?status=${only}` : ""}`) : Promise.resolve(null)), [only]);
  const [busy, setBusy] = useState("");
  if (!can("MANAGER")) return <div className="err-box">Only managers and owners can see the message log.</div>;
  const run = async (k: string, fn: () => Promise<unknown>, ok: string) => { setBusy(k); try { await fn(); toast(ok); reload(); } catch (e) { toast(msg(e), "err"); } finally { setBusy(""); } };
  const c = data?.counts ?? {}; const dev = data && (data.providers.sms === "log" || data.providers.email === "log");
  return (<><PageHead title="Customer messages" sub="Order updates sent by SMS and email. A failed message is retried a few times, then waits here for you.">
      <button className="btn sec" disabled={!!busy} onClick={() => run("send", () => adm("/admin/jobs/send-notifications", { method: "POST" }), "Sent what was due")}>Send now</button></PageHead>
    {err && <div className="err-box">{err}</div>}
    {dev && <div className="err-box" role="status">{data!.providers.sms === "log" ? "SMS is in log-only mode: customers are not receiving texts. " : ""}{data!.providers.email === "log" ? "Email is in log-only mode: customers are not receiving emails. " : ""}Set the SMS and email providers in the server settings before launch.</div>}
    {data && <><div className="grid4"><div className="card kpi"><h2>Sent</h2><b>{c.SENT ?? 0}</b><span>Delivered to the provider</span></div><div className="card kpi"><h2>Waiting</h2><b>{c.PENDING ?? 0}</b><span>Queued or retrying</span></div><div className="card kpi"><h2>Needs attention</h2><b style={{ color: c.FAILED ? "var(--accent)" : undefined }}>{c.FAILED ?? 0}</b><span>Gave up after retries</span></div>
      <div className="card kpi"><h2>Providers</h2><b style={{ fontSize: 20 }}>{label(data.providers.sms)} · {label(data.providers.email)}</b><span>SMS · Email</span></div></div>
      <div className="filters" style={{ marginTop: 16 }}>{["", "FAILED", "PENDING", "SENT"].map((s) => <button key={s} className={`btn sm ${only === s ? "" : "sec"}`} onClick={() => setOnly(s)}>{s ? label(s) : "All"}</button>)}</div>
      <div className="tbl"><table><thead><tr><th>When</th><th>To</th><th>Message</th><th>Status</th><th><span className="sr">Actions</span></th></tr></thead><tbody>
        {data.items.map((n) => <tr key={n.id}><td>{when(n.createdAt)}</td><td>{n.channel === "SMS" ? "SMS" : "Email"} · {n.recipient}</td><td>{label(n.template.replace("ORDER_", ""))}</td><td><span className={`pill ${tone(n.status)}`}>{label(n.status)}</span>{n.attempts > 0 && n.status !== "SENT" && <small>{n.attempts} tries{n.lastError ? ` · ${n.lastError}` : ""}</small>}</td>
          <td className="num">{n.status === "FAILED" && <button className="btn sm sec" disabled={!!busy} onClick={() => run(n.id, () => adm(`/admin/notifications/${n.id}/retry`, { method: "POST" }), "Queued again")}>Try again</button>}</td></tr>)}
        {data.items.length === 0 && <tr><td colSpan={5} className="empty">Nothing here.</td></tr>}</tbody></table></div></>}</>);
}
