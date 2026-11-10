"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, friendly } from "@/lib/api";
import { inr } from "@/lib/data";
import { useShop } from "@/components/Providers";

type Quote = { subtotalPaise: number; shippingPaise: number; codFeePaise: number; taxPaise: number; totalPaise: number; problem: string | null; unavailable: string[] };
type Svc = { local: boolean; codAllowed: boolean; estimate: string; pincode: string };
type Addr = { id: string; fullName: string; phone: string; line1: string; line2?: string; city: string; state: string; postalCode: string; isDefault: boolean };

export default function Checkout() {
  const { bag, subtotalPaise, clear, user, authApi, toast } = useShop(); const router = useRouter();
  const [f, setF] = useState({ name: "", phone: "", line1: "", line2: "", city: "Jammu", state: "Jammu & Kashmir", postalCode: "" });
  const [ful, setFul] = useState<"COURIER" | "LOCAL" | "PICKUP">("COURIER"); const [method, setMethod] = useState<"UPI" | "CARD" | "COD">("UPI");
  const [svc, setSvc] = useState<Svc | null>(null); const [quote, setQuote] = useState<Quote | null>(null); const [qerr, setQerr] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [pay, setPay] = useState<{ ref: string; amount: number; order: string; phone: string } | null>(null); const [saved, setSaved] = useState<Addr[]>([]);
  const key = useRef<{ sig: string; id: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  useEffect(() => { if (!user) return; setF((x) => ({ ...x, name: x.name || user.name || "", phone: x.phone || user.phone })); authApi<Addr[]>("/addresses").then(setSaved).catch(() => {}); }, [user, authApi]);
  const useAddr = (a: Addr) => setF({ name: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state, postalCode: a.postalCode });

  useEffect(() => { if (/^\d{6}$/.test(f.postalCode)) api<Svc>(`/checkout/serviceability?pincode=${f.postalCode}`).then(setSvc).catch(() => setSvc(null)); else setSvc(null); }, [f.postalCode]);
  useEffect(() => { if (ful === "LOCAL" && svc && !svc.local) setFul("COURIER"); if (method === "COD" && svc && !svc.codAllowed) setMethod("UPI"); }, [svc, ful, method]);

  const lines = useMemo(() => bag.map((l) => ({ sku: l.sku, quantity: l.quantity })), [bag]);
  useEffect(() => {
    if (!lines.length) return; const ctl = new AbortController(); setQerr("");
    api<Quote>("/checkout/quote", { method: "POST", body: { lines, fulfilmentType: ful, paymentMethod: method, pincode: /^\d{6}$/.test(f.postalCode) ? f.postalCode : undefined }, signal: ctl.signal }).then(setQuote).catch((e) => { if (e.name !== "AbortError") setQerr(friendly(e)); });
    return () => ctl.abort();
  }, [lines, ful, method, f.postalCode]);

  const needAddr = ful !== "PICKUP";
  const problem = quote?.problem ? friendly(new ApiError(quote.problem, quote.problem, 422)) : "";
  const oos = quote?.unavailable ?? [];
  const valid = f.name.trim().length > 1 && /^[6-9]\d{9}$/.test(f.phone) && (!needAddr || (f.line1.trim().length > 2 && f.city.length > 1 && /^\d{6}$/.test(f.postalCode)));

  const place = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy || !valid) return; setBusy(true); setErr("");
    const body = { lines, fulfilmentType: ful, paymentMethod: method, contact: { name: f.name.trim(), phone: f.phone }, address: needAddr ? { line1: f.line1, line2: f.line2 || undefined, city: f.city, state: f.state, postalCode: f.postalCode } : undefined };
    const sig = JSON.stringify(body); if (key.current?.sig !== sig) key.current = { sig, id: crypto.randomUUID() }; // same attempt => same key (safe retries)
    try {
      const o = await authApi<{ number: string; status: string }>("/checkout/orders", { method: "POST", body: { ...body, idempotencyKey: key.current.id } });
      clear();
      if (method === "COD") { router.push(`/order/${o.number}?phone=${f.phone}&new=1`); return; }
      const s = await api<{ paymentRef: string; amountPaise: number }>("/payments/session", { method: "POST", body: { orderNumber: o.number, phone: f.phone } });
      setPay({ ref: s.paymentRef, amount: s.amountPaise, order: o.number, phone: f.phone });
    } catch (e) { setErr(friendly(e)); if (e instanceof ApiError && e.code === "INSUFFICIENT_STOCK") toast("An item in your bag is no longer available", "err"); }
    finally { setBusy(false); }
  };
  const finish = async (outcome: "success" | "fail") => {
    if (!pay) return; setBusy(true);
    try { await api(`/payments/mock/${pay.ref}/pay`, { method: "POST", body: { outcome } }); } catch (e) { setErr(friendly(e)); }
    router.push(`/order/${pay.order}?phone=${pay.phone}${outcome === "success" ? "&new=1" : ""}`);
  };

  if (!bag.length && !pay) return <section className="banner"><p className="eyebrow">Checkout</p><h1>Your bag is empty</h1><p className="lede">Add something you love first.</p><Link className="btn" href="/collections/new-arrivals">Shop new arrivals</Link></section>;
  const q = quote ?? { subtotalPaise, shippingPaise: 0, codFeePaise: 0, taxPaise: 0, totalPaise: subtotalPaise };
  return (
    <>
      <section className="banner slim"><p className="eyebrow">Secure checkout</p><h1>Checkout</h1></section>
      <form className="wrap co" onSubmit={place} noValidate>
        <div className="co-main">
          {!user && <p className="note">Have an account? <Link href="/account" className="link">Sign in</Link> to use saved addresses. You can also check out as a guest.</p>}
          <h2><span>1</span>Contact & delivery</h2>
          {saved.length > 0 && <div className="chips saved">{saved.map((a) => <button type="button" key={a.id} onClick={() => useAddr(a)}>{a.fullName}, {a.postalCode}</button>)}</div>}
          <div className="fields">
            <label>Full name<input required value={f.name} onChange={set("name")} autoComplete="name" /></label>
            <label>Mobile number<input required value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} inputMode="tel" autoComplete="tel-national" placeholder="10-digit number" /></label>
            {needAddr && <>
              <label className="w2">Address<input required value={f.line1} onChange={set("line1")} autoComplete="address-line1" placeholder="House no., street, area" /></label>
              <label className="w2">Landmark (optional)<input value={f.line2} onChange={set("line2")} autoComplete="address-line2" /></label>
              <label>City<input required value={f.city} onChange={set("city")} autoComplete="address-level2" /></label>
              <label>Pincode<input required value={f.postalCode} onChange={(e) => setF({ ...f, postalCode: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" autoComplete="postal-code" placeholder="6 digits" /></label>
            </>}
          </div>

          <h2><span>2</span>Delivery method</h2>
          <div className="radios">
            {([["COURIER", "Courier delivery", svc ? svc.estimate.includes("Same") ? "3–6 days" : svc.estimate : "3–6 days", true], ["LOCAL", "Jammu local delivery", "Same or next day", !!svc?.local], ["PICKUP", "Collect from showroom", "Ready in 24 hours · Free", true]] as const).map(([v, a, b, ok]) => (
              <label key={v} className={`${ful === v ? "on" : ""} ${!ok ? "off" : ""}`}><input type="radio" name="f" disabled={!ok} checked={ful === v} onChange={() => setFul(v)} /><b>{a}</b><span>{ok ? b : v === "LOCAL" ? "Enter a Jammu pincode" : ""}</span></label>))}
          </div>

          <h2><span>3</span>Payment</h2>
          <div className="radios">
            {([["UPI", "UPI", "GPay, PhonePe, Paytm, BHIM", true], ["CARD", "Card", "Credit and debit cards", true], ["COD", "Cash on delivery", "₹49 handling fee", svc ? svc.codAllowed : true]] as const).map(([v, a, b, ok]) => (
              <label key={v} className={`${method === v ? "on" : ""} ${!ok ? "off" : ""}`}><input type="radio" name="p" disabled={!ok} checked={method === v} onChange={() => setMethod(v)} /><b>{a}</b><span>{ok ? b : "Not available for this pincode"}</span></label>))}
          </div>
        </div>

        <aside className="sum" aria-label="Order summary">
          <h2>Order summary</h2>
          {bag.map((l) => <div key={l.sku} className={`row ${oos.includes(l.sku) ? "oos" : ""}`}><img src={l.image} alt="" width={56} height={72} /><span>{l.name}<small>{l.colour} · {l.size} · Qty {l.quantity}</small>{oos.includes(l.sku) && <em>Not enough stock</em>}</span><b>{inr(l.pricePaise * l.quantity)}</b></div>)}
          <div className="tot"><div><span>Subtotal</span><b>{inr(q.subtotalPaise)}</b></div><div><span>Shipping</span><b>{ful === "PICKUP" ? "Free" : q.shippingPaise ? inr(q.shippingPaise) : "Free"}</b></div>
            {q.codFeePaise > 0 && <div><span>COD handling</span><b>{inr(q.codFeePaise)}</b></div>}<div className="grand"><span>Total</span><b>{inr(q.totalPaise)}</b></div><small>Includes {inr(q.taxPaise)} GST</small></div>
          {(problem || qerr || err) && <p className="err-box" role="alert">{problem || qerr || err}</p>}
          <button className="btn big" disabled={busy || !valid || !!problem || oos.length > 0}>{busy ? "Placing order…" : method === "COD" ? "Place order" : `Pay ${inr(q.totalPaise)}`}</button>
          {!valid && <p className="hint">Fill in your contact{needAddr ? " and address" : ""} details to continue.</p>}
        </aside>
      </form>

      {pay && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Payment">
          <div className="modal-in">
            <p className="eyebrow">Test payment gateway</p><h2>Pay {inr(pay.amount)}</h2>
            <p>No real money moves. This stands in for UPI or card until a payment provider is connected. Your order <b>{pay.order}</b> is held for 15 minutes.</p>
            <div className="modal-actions"><button className="btn" disabled={busy} onClick={() => finish("success")}>Simulate successful payment</button><button className="btn outline" disabled={busy} onClick={() => finish("fail")}>Simulate failed payment</button></div>
            {err && <p className="err-box">{err}</p>}
          </div>
        </div>
      )}
    </>
  );
}
