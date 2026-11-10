"use client";
import Link from "next/link";
import { useState } from "react";
import { bySlug, inr } from "@/lib/data";
import { DEMO_ORDER as O } from "@/lib/orders";
export default function Track() {
  const [n, setN] = useState(""); const [ph, setPh] = useState(""); const [res, setRes] = useState<"" | "ok" | "no">("");
  return (<><section className="banner"><h1>Track your order</h1><p>Enter your order number and mobile number.</p></section>
    <div className="prose wide">
      <form className="fields" onSubmit={(e) => { e.preventDefault(); setRes(n.trim().toUpperCase() === O.number && ph === O.phone ? "ok" : "no"); }}>
        <input required value={n} onChange={(e) => setN(e.target.value)} placeholder="Order number (e.g. JF100001)" /><input required value={ph} onChange={(e) => setPh(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" placeholder="Mobile number" />
        <button className="btn w2">Track</button></form>
      <p className="hint">Demo: use JF100001 and 9999999999. Real tracking will come from the courier once the API is connected.</p>
      {res === "no" && <p className="err-box">We couldn't find that order. Check the number and mobile and try again.</p>}
      {res === "ok" && <div className="trk"><h2>Order {O.number}</h2><p className="hint">Placed {O.placed} · {O.method} · {inr(O.total)}</p>
        <ol className="steps">{O.steps.map(([a, b, d]) => <li key={a} className={d ? "done" : ""}><b>{a}</b><span>{b}</span></li>)}</ol>
        {O.items.map((l) => { const p = bySlug(l.slug)!; return <div key={l.slug} className="row"><img src={p.images[0]} alt="" /><span>{p.name}<small>{l.colour} · {l.size} × {l.qty}</small></span><b>{inr(p.pricePaise)}</b></div>; })}
        <p><Link className="link" href="/returns">Need to return or exchange?</Link></p></div>}
    </div></>);
}
