"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { bySlug, inr } from "@/lib/data";
import { DEMO_ORDER as O } from "@/lib/orders";
type U = { phone: string; name: string; address: string };
const K = "jf-user";
export default function Account() {
  const [u, setU] = useState<U | null>(null); const [ready, setReady] = useState(false); const [step, setStep] = useState<"phone" | "otp">("phone"); const [phone, setPhone] = useState(""); const [otp, setOtp] = useState(""); const [err, setErr] = useState(""); const [tab, setTab] = useState("orders"); const [gone, setGone] = useState(false);
  useEffect(() => { try { const v = localStorage.getItem(K); if (v) setU(JSON.parse(v)); } catch {} setReady(true); }, []);
  const save = (x: U | null) => { setU(x); try { x ? localStorage.setItem(K, JSON.stringify(x)) : localStorage.removeItem(K); } catch {} };
  if (!ready) return null;
  if (gone) return <section className="banner"><h1>Deletion requested</h1><p>We'll confirm by SMS and remove your data within 30 days.</p></section>;
  if (!u) return (<><section className="banner"><h1>Sign in</h1><p>Use your mobile number. No password needed.</p></section>
    <div className="prose narrow"><form className="fields one" onSubmit={(e) => { e.preventDefault(); setErr("");
      if (step === "phone") { if (!/^[6-9]\d{9}$/.test(phone)) return setErr("Enter a valid 10-digit mobile number"); setStep("otp"); }
      else if (otp === "123456") save({ phone, name: "", address: "" }); else setErr("Incorrect code"); }}>
      {step === "phone" ? <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" placeholder="Mobile number" aria-label="Mobile number" /> : <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6-digit code" aria-label="OTP" autoFocus />}
      {err && <p className="err-box">{err}</p>}<button className="btn">{step === "phone" ? "Send code" : "Verify & sign in"}</button>
      <p className="hint">{step === "otp" ? `Demo: no SMS is sent. Enter 123456.` : "We'll text you a one-time code."}</p></form></div></>);
  const tabs: [string, string][] = [["orders", "Orders"], ["profile", "Profile"], ["address", "Addresses"], ["prefs", "Preferences"]];
  return (<><section className="banner"><h1>My account</h1><p>+91 {u.phone}</p></section>
    <div className="prose wide"><div className="chips center">{tabs.map(([k, v]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{v}</button>)}<Link href="/wishlist"><button>Wishlist</button></Link><Link href="/returns"><button>Returns</button></Link></div>
      {tab === "orders" && <div className="trk"><p className="hint">Demo order shown. Real history will load from the API.</p>
        <div className="ord"><div><b>{O.number}</b><span>{O.placed} · {inr(O.total)} · Out for delivery</span></div><Link className="link" href="/track">Track</Link></div>
        {O.items.map((l) => { const p = bySlug(l.slug)!; return <div key={l.slug} className="row"><img src={p.images[0]} alt="" /><span>{p.name}<small>{l.colour} · {l.size}</small></span><b>{inr(p.pricePaise)}</b></div>; })}</div>}
      {tab === "profile" && <form className="fields" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save({ ...u, name: String(f.get("name")) }); }}><input name="name" defaultValue={u.name} placeholder="Full name" /><input disabled value={`+91 ${u.phone}`} /><button className="btn">Save</button></form>}
      {tab === "address" && <form className="fields one" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save({ ...u, address: String(f.get("a")) }); }}><textarea name="a" defaultValue={u.address} placeholder="Delivery address, city, pincode" rows={4} /><button className="btn">Save address</button></form>}
      {tab === "prefs" && <div className="fields one">{["Order updates by SMS", "Order updates on WhatsApp", "Offers and new drops by email"].map((t, i) => <label key={t} className="chk"><input type="checkbox" defaultChecked={i < 2} /> {t}</label>)}</div>}
      <div className="danger"><button className="link" onClick={() => save(null)}>Sign out</button> · <button className="link" onClick={() => confirm("Request deletion of your account and data?") && (save(null), setGone(true))}>Delete my account</button></div></div></>);
}
