"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, friendly } from "@/lib/api";

export default function Track() {
  const router = useRouter(); const [n, setN] = useState(""); const [ph, setPh] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(""); const num = n.trim().toUpperCase();
    try { await api(`/orders/${encodeURIComponent(num)}?phone=${ph}`); router.push(`/order/${num}?phone=${ph}`); } catch (x) { setErr(friendly(x)); setBusy(false); }
  };
  return (<><section className="banner slim"><p className="eyebrow">Order status</p><h1>Track your order</h1><p className="lede">Enter your order number and the mobile number used at checkout.</p></section>
    <div className="wrap narrow-form"><form className="fields one" onSubmit={go}>
      <label>Order number<input required value={n} onChange={(e) => setN(e.target.value)} placeholder="JF100001" autoCapitalize="characters" /></label>
      <label>Mobile number<input required value={ph} onChange={(e) => setPh(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" placeholder="10-digit number" /></label>
      {err && <p className="err-box" role="alert">{err}</p>}
      <button className="btn big" disabled={busy || ph.length !== 10 || n.trim().length < 4}>{busy ? "Looking up…" : "Track order"}</button></form></div></>);
}
