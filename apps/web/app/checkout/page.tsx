"use client";
import Link from "next/link";
import { useState } from "react";
import { bySlug, inr } from "@/lib/data";
import { useShop } from "@/components/Providers";

export default function Checkout() {
  const { bag, subtotalPaise, clear } = useShop(); const [method, setMethod] = useState("UPI"); const [ful, setFul] = useState("COURIER"); const [done, setDone] = useState("");
  const ship = ful === "PICKUP" ? 0 : subtotalPaise >= 199900 ? 0 : 9900; const total = subtotalPaise + ship + (method === "COD" ? 4900 : 0);
  if (done) return <section className="banner"><h1>Order placed ✓</h1><p>Order {done}. This is a demo: no payment was taken.</p><Link className="btn" href="/">Continue shopping</Link></section>;
  if (!bag.length) return <section className="banner"><h1>Your bag is empty</h1><Link className="btn" href="/collections/new-arrivals">Shop new arrivals</Link></section>;
  return (
    <form className="co" onSubmit={(e) => { e.preventDefault(); setDone("JF" + Date.now().toString().slice(-6)); clear(); }}>
      <div>
        <h2>Contact & address</h2>
        <div className="fields"><input required placeholder="Full name" /><input required inputMode="tel" placeholder="Mobile number" pattern="[0-9]{10}" /><input required className="w2" placeholder="Address" /><input required placeholder="City" /><input required inputMode="numeric" pattern="[0-9]{6}" placeholder="Pincode" /></div>
        <h2>Delivery</h2>
        <div className="radios">{[["COURIER", "Courier (India-wide)", "3–6 days"], ["LOCAL", "Jammu local delivery", "Same / next day"], ["PICKUP", "Pick up at showroom", "Free"]].map(([v, a, b]) => <label key={v} className={ful === v ? "on" : ""}><input type="radio" name="f" checked={ful === v} onChange={() => setFul(v!)} /><b>{a}</b><span>{b}</span></label>)}</div>
        <h2>Payment</h2>
        <div className="radios">{[["UPI", "UPI", "GPay, PhonePe, Paytm"], ["CARD", "Card", "Credit / debit"], ["COD", "Cash on delivery", "+ ₹49 handling"]].map(([v, a, b]) => <label key={v} className={method === v ? "on" : ""}><input type="radio" name="p" checked={method === v} onChange={() => setMethod(v!)} /><b>{a}</b><span>{b}</span></label>)}</div>
      </div>
      <aside className="sum"><h2>Summary</h2>
        {bag.map((l) => { const p = bySlug(l.slug)!; return <div key={l.slug + l.size + l.colour} className="row"><img src={p.images[0]} alt="" /><span>{p.name}<small>{l.colour} · {l.size} × {l.qty}</small></span><b>{inr(p.pricePaise * l.qty)}</b></div>; })}
        <div className="row t"><span>Subtotal</span><b>{inr(subtotalPaise)}</b></div><div className="row t"><span>Shipping</span><b>{ship ? inr(ship) : "Free"}</b></div>{method === "COD" && <div className="row t"><span>COD handling</span><b>₹49</b></div>}
        <div className="row t big"><span>Total</span><b>{inr(total)}</b></div><button className="btn big">Place order</button><small>Demo checkout: totals will be recalculated by the server once the API is connected.</small></aside>
    </form>
  );
}
