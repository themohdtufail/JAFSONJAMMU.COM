"use client";
import { adm, label, when } from "@/lib/api";
import { PageHead, useLoad } from "@/components/Shell";
interface A { id: string; actor: string; action: string; entity: string; entityId: string; data: any; createdAt: string }
export default function Audit() {
  const { data, err } = useLoad(() => adm<A[]>("/admin/audit?limit=200"), []);
  return (<><PageHead title="Audit log" sub="Who changed what. Entries can't be edited." />{err && <div className="err-box">{err}</div>}
    <div className="tbl"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>
      {data?.map((a) => <tr key={a.id}><td>{when(a.createdAt)}</td><td>{a.actor}</td><td><b>{label(a.action)}</b></td><td>{label(a.entity)} {a.entityId}</td><td style={{ color: "var(--mute)", fontSize: 12 }}>{a.data ? Object.entries(a.data).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ") : ""}</td></tr>)}
      {data?.length === 0 && <tr><td colSpan={5} className="empty">No activity yet.</td></tr>}{!data && !err && <tr><td colSpan={5} className="empty">Loading…</td></tr>}</tbody></table></div></>);
}
