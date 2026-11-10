"use client";
import { useState } from "react";
import { bySlug } from "@/lib/data";
import { DEMO_ORDER as O } from "@/lib/orders";
export default function Returns() {
  const [n, setN] = useState(""); const [ph, setPh] = useState(""); const [ok, setOk] = useState(false); const [sel, setSel] = useState<Record<string, { kind: string; reason: string; size: string }>>({}); const [done, setDone] = useState("");
  if (done) return <section className="banner"><h1>Request received ✓</h1><p>Reference {done}. We'll review it within one working day. (Demo: nothing was saved.)</p></section>;
  return (<><section className="banner"><h1>Returns & exchange</h1><p>Within 7 days of delivery, unworn with tags.</p></section>
    <div className="prose wide">
      {!ok ? <><form className="fields" onSubmit={(e) => { e.preventDefault(); setOk(n.trim().toUpperCase() === O.number && ph === O.phone); }}>
        <input required value={n} onChange={(e) => setN(e.target.value)} placeholder="Order number" /><input required value={ph} onChange={(e) => setPh(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Mobile number" /><button className="btn w2">Find my order</button></form>
        <p className="hint">Demo: JF100001 / 9999999999.</p></>
      : <form onSubmit={(e) => { e.preventDefault(); setDone("RT" + Date.now().toString().slice(-6)); }}>
        {O.items.map((l) => { const p = bySlug(l.slug)!; const s = sel[l.slug]; return (
          <div key={l.slug} className="rt"><label className="rt-h"><input type="checkbox" checked={!!s} onChange={(e) => setSel((x) => { const y = { ...x }; if (e.target.checked) y[l.slug] = { kind: "RETURN", reason: "", size: p.sizes[0]! }; else delete y[l.slug]; return y; })} />
            <img src={p.images[0]} alt="" /><span>{p.name}<small>{l.colour} · {l.size}</small></span></label>
            {s && <div className="fields"><select value={s.kind} onChange={(e) => setSel({ ...sel, [l.slug]: { ...s, kind: e.target.value } })}><option value="RETURN">Return for refund</option><option value="EXCHANGE">Exchange size</option></select>
              {s.kind === "EXCHANGE" ? <select value={s.size} onChange={(e) => setSel({ ...sel, [l.slug]: { ...s, size: e.target.value } })}>{p.sizes.filter((z) => z !== l.size).map((z) => <option key={z}>{z}</option>)}</select> : <span />}
              <select required className="w2" value={s.reason} onChange={(e) => setSel({ ...sel, [l.slug]: { ...s, reason: e.target.value } })}><option value="">Reason…</option><option>Size too small</option><option>Size too large</option><option>Not as expected</option><option>Damaged or defective</option></select></div>}</div>); })}
        <button className="btn big" disabled={!Object.keys(sel).length || Object.values(sel).some((v) => !v.reason)}>Submit request</button></form>}
    </div></>);
}
