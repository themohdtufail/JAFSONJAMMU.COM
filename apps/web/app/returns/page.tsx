"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, friendly } from "@/lib/api";
import { sizeLabel } from "@/lib/data";
import { useShop } from "@/components/Providers";

interface Order { number: string; status: string; items: { id: string; name: string; colour: string; size: string; imageUrl: string | null; quantity: number }[] }
const SIZES: Record<string, string[]> = { men: ["S", "M", "L", "XL", "XXL"], kids: ["2-3Y", "4-5Y", "6-7Y", "8-9Y", "10-11Y"] };
const REASONS = ["Size too small", "Size too large", "Not as expected", "Damaged or defective", "Changed my mind"];

function Form() {
  const sp = useSearchParams(); const { authApi, authReady } = useShop();
  const [n, setN] = useState(sp.get("order") ?? ""); const [ph, setPh] = useState(sp.get("phone") ?? ""); const [o, setO] = useState<Order | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState("");
  const [sel, setSel] = useState<Record<string, { kind: "RETURN" | "EXCHANGE"; reason: string; size: string }>>({});
  const find = async (e?: React.FormEvent) => { e?.preventDefault(); setBusy(true); setErr(""); try { setO(await authApi<Order>(`/orders/${n.trim().toUpperCase()}${ph ? `?phone=${ph}` : ""}`)); } catch (x) { setErr(friendly(x)); } finally { setBusy(false); } };
  useEffect(() => { if (authReady && sp.get("order") && sp.get("phone")) find(); /* eslint-disable-next-line */ }, [authReady]);
  const toggle = (id: string, on: boolean) => setSel((x) => { const y = { ...x }; if (on) y[id] = { kind: "RETURN", reason: "", size: "" }; else delete y[id]; return y; });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!o) return; setBusy(true); setErr("");
    try { const r = await authApi<{ ref: string }>("/returns", { method: "POST", body: { orderNumber: o.number, phone: ph || undefined, items: Object.entries(sel).map(([orderItemId, v]) => ({ orderItemId, kind: v.kind, reason: v.reason, exchangeSize: v.kind === "EXCHANGE" ? v.size : undefined })) } }); setDone(r.ref); }
    catch (x) { setErr(friendly(x)); } finally { setBusy(false); }
  };
  const ok = Object.keys(sel).length > 0 && Object.values(sel).every((v) => v.reason && (v.kind === "RETURN" || v.size));
  if (done) return <section className="banner"><p className="eyebrow">Request received</p><h1>Reference {done}</h1><p className="lede">We'll review your request within one working day and email or text you the next steps.</p><Link href="/" className="btn">Continue shopping</Link></section>;
  return (<><section className="banner slim"><p className="eyebrow">Within 7 days of delivery</p><h1>Returns & exchange</h1><p className="lede">Items must be unworn, unwashed and have tags attached.</p></section>
    <div className="wrap narrow-form wide">
      {!o ? <form className="fields one" onSubmit={find}><label>Order number<input required value={n} onChange={(e) => setN(e.target.value)} placeholder="JF100001" /></label><label>Mobile number<input value={ph} onChange={(e) => setPh(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" placeholder="Used at checkout" /></label>
        {err && <p className="err-box" role="alert">{err}</p>}<button className="btn big" disabled={busy || n.length < 4}>{busy ? "Looking up…" : "Find my order"}</button></form>
      : !["DELIVERED", "COLLECTED"].includes(o.status) ? <div className="note">Order {o.number} is <b>{o.status.replace(/_/g, " ").toLowerCase()}</b>. Returns open once it's delivered. <Link href={`/order/${o.number}?phone=${ph}`} className="link">View order</Link></div>
      : <form onSubmit={submit}>
        <h2 className="sm-h">Choose items from order {o.number}</h2>
        {o.items.map((i) => { const s = sel[i.id]; const fam = i.size.includes("Y") ? "kids" : "men"; return (
          <div key={i.id} className={`rt ${s ? "on" : ""}`}><label className="rt-h"><input type="checkbox" checked={!!s} onChange={(e) => toggle(i.id, e.target.checked)} /><img src={i.imageUrl ?? ""} alt="" width={56} height={72} /><span>{i.name}<small>{i.colour} · {sizeLabel(i.size)} · Qty {i.quantity}</small></span></label>
            {s && <div className="fields">
              <label>What would you like?<select value={s.kind} onChange={(e) => setSel({ ...sel, [i.id]: { ...s, kind: e.target.value as "RETURN" | "EXCHANGE" } })}><option value="RETURN">Return for refund</option><option value="EXCHANGE">Exchange for another size</option></select></label>
              {s.kind === "EXCHANGE" ? <label>New size<select value={s.size} onChange={(e) => setSel({ ...sel, [i.id]: { ...s, size: e.target.value } })}><option value="">Select…</option>{SIZES[fam]!.filter((z) => z !== i.size).map((z) => <option key={z}>{z}</option>)}</select></label> : <span />}
              <label className="w2">Reason<select value={s.reason} onChange={(e) => setSel({ ...sel, [i.id]: { ...s, reason: e.target.value } })}><option value="">Select…</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></label></div>}</div>); })}
        {err && <p className="err-box" role="alert">{err}</p>}<button className="btn big" disabled={busy || !ok}>{busy ? "Submitting…" : "Submit request"}</button></form>}
    </div></>);
}
export default function Returns() { return <Suspense fallback={null}><Form /></Suspense>; }
