"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, friendly } from "@/lib/api";
import { inr } from "@/lib/data";
import { useShop, type User } from "@/components/Providers";

interface OrderLite { number: string; status: string; placedAt: string; totals: { totalPaise: number }; items: { id: string; name: string; imageUrl: string | null; size: string; colour: string }[] }
interface Addr { id: string; fullName: string; phone: string; line1: string; line2?: string | null; city: string; state: string; postalCode: string; isDefault: boolean }
interface Ret { ref: string; status: string; orderNumber: string; createdAt: string; items: { name: string; size: string; kind: string; reason: string }[] }
const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function SignIn() {
  const { signIn, toast } = useShop();
  const [step, setStep] = useState<"phone" | "otp">("phone"); const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [dev, setDev] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      if (step === "phone") { const r = await api<{ devCode?: string }>("/auth/otp/request", { method: "POST", body: { phone } }); setDev(r.devCode ?? ""); setStep("otp"); }
      else { const r = await api<{ accessToken: string; refreshToken: string; user: User }>("/auth/otp/verify", { method: "POST", body: { phone, code } }); signIn({ accessToken: r.accessToken, refreshToken: r.refreshToken }, r.user); toast("Signed in"); }
    } catch (x) { setErr(friendly(x)); } finally { setBusy(false); }
  };
  return (<><section className="banner slim"><p className="eyebrow">Welcome</p><h1>Sign in</h1><p className="lede">Use your mobile number. No password to remember.</p></section>
    <div className="wrap narrow-form"><form className="fields one" onSubmit={submit}>
      {step === "phone" ? <label>Mobile number<input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" autoComplete="tel-national" placeholder="10-digit number" autoFocus /></label>
        : <label>6-digit code sent to +91 {phone}<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" autoFocus /></label>}
      {dev && step === "otp" && <p className="note">Development mode: SMS isn't connected yet. Your code is <b>{dev}</b>.</p>}
      {err && <p className="err-box" role="alert">{err}</p>}
      <button className="btn big" disabled={busy || (step === "phone" ? phone.length !== 10 : code.length !== 6)}>{busy ? "Please wait…" : step === "phone" ? "Send code" : "Verify and sign in"}</button>
      {step === "otp" && <button type="button" className="link" onClick={() => { setStep("phone"); setCode(""); setErr(""); }}>Use a different number</button>}
    </form></div></>);
}

export default function Account() {
  const { user, authReady, authApi, signOut, setUser, toast } = useShop();
  const [tab, setTab] = useState("orders"); const [orders, setOrders] = useState<OrderLite[] | null>(null); const [addrs, setAddrs] = useState<Addr[] | null>(null); const [rets, setRets] = useState<Ret[] | null>(null);
  const [name, setName] = useState(""); const [af, setAf] = useState({ fullName: "", phone: "", line1: "", city: "Jammu", state: "Jammu & Kashmir", postalCode: "" }); const [adding, setAdding] = useState(false); const [gone, setGone] = useState(false);
  useEffect(() => { if (user) setName(user.name ?? ""); }, [user]);
  const loadOrders = useCallback(() => authApi<OrderLite[]>("/orders").then(setOrders).catch((e) => toast(friendly(e), "err")), [authApi, toast]);
  useEffect(() => { if (!user) return; if (tab === "orders" && !orders) loadOrders(); if (tab === "addresses" && !addrs) authApi<Addr[]>("/addresses").then(setAddrs).catch(() => {}); if (tab === "returns" && !rets) authApi<Ret[]>("/returns").then(setRets).catch(() => {}); }, [user, tab, orders, addrs, rets, authApi, loadOrders]);

  if (!authReady) return <section className="banner slim"><h1>Account</h1></section>;
  if (gone) return <section className="banner"><p className="eyebrow">Account</p><h1>Deletion requested</h1><p className="lede">Your account is closed and will be erased after the statutory retention period.</p></section>;
  if (!user) return <SignIn />;
  const tabs: [string, string][] = [["orders", "Orders"], ["addresses", "Addresses"], ["returns", "Returns"], ["profile", "Profile"]];
  const saveName = async (e: React.FormEvent) => { e.preventDefault(); try { setUser(await authApi<User>("/auth/me", { method: "PATCH", body: { name } })); toast("Profile saved"); } catch (x) { toast(friendly(x), "err"); } };
  const addAddr = async (e: React.FormEvent) => { e.preventDefault(); try { const a = await authApi<Addr>("/addresses", { method: "POST", body: af }); setAddrs((x) => [a, ...(x ?? [])]); setAdding(false); toast("Address saved"); } catch (x) { toast(friendly(x), "err"); } };
  const delAddr = async (id: string) => { try { await authApi(`/addresses/${id}`, { method: "DELETE" }); setAddrs((x) => (x ?? []).filter((a) => a.id !== id)); } catch (x) { toast(friendly(x), "err"); } };
  const del = async () => { if (!confirm("Request deletion of your account? You'll be signed out.")) return; try { await authApi("/auth/account", { method: "DELETE" }); signOut(); setGone(true); } catch (x) { toast(friendly(x), "err"); } };
  return (<><section className="banner slim"><p className="eyebrow">My account</p><h1>{user.name ? `Hello, ${user.name.split(" ")[0]}` : "Welcome back"}</h1><p className="lede">+91 {user.phone}</p></section>
    <div className="wrap acct">
      <div className="chips center" role="tablist">{tabs.map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{v}</button>)}<Link href="/wishlist" className="chiplink">Wishlist</Link></div>

      {tab === "orders" && <div>{!orders ? <p className="empty">Loading…</p> : orders.length === 0 ? <p className="empty">No orders yet. <Link href="/collections/new-arrivals" className="link">Start shopping</Link></p> : orders.map((o) => (
        <Link key={o.number} href={`/order/${o.number}`} className="ord"><div className="ord-imgs">{o.items.slice(0, 3).map((i) => <img key={i.id} src={i.imageUrl ?? ""} alt="" width={56} height={72} />)}</div>
          <div><b>{o.number}</b><span>{new Date(o.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {o.items.length} {o.items.length === 1 ? "item" : "items"}</span></div><div className="ord-r"><b>{inr(o.totals.totalPaise)}</b><span className={`pill ${o.status.toLowerCase()}`}>{label(o.status)}</span></div></Link>))}</div>}

      {tab === "addresses" && <div>{!addrs ? <p className="empty">Loading…</p> : <>{addrs.map((a) => <div key={a.id} className="addr-card"><div><b>{a.fullName}</b>{a.isDefault && <em>Default</em>}<p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.postalCode}<br />+91 {a.phone}</p></div><button className="link" onClick={() => delAddr(a.id)}>Remove</button></div>)}
        {addrs.length === 0 && !adding && <p className="empty">No saved addresses.</p>}
        {adding ? <form className="fields" onSubmit={addAddr}>
          <label>Full name<input required value={af.fullName} onChange={(e) => setAf({ ...af, fullName: e.target.value })} /></label><label>Mobile<input required value={af.phone} onChange={(e) => setAf({ ...af, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} inputMode="tel" /></label>
          <label className="w2">Address<input required value={af.line1} onChange={(e) => setAf({ ...af, line1: e.target.value })} /></label><label>City<input required value={af.city} onChange={(e) => setAf({ ...af, city: e.target.value })} /></label><label>Pincode<input required value={af.postalCode} onChange={(e) => setAf({ ...af, postalCode: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" /></label>
          <div className="w2 row-btns"><button className="btn">Save address</button><button type="button" className="btn outline" onClick={() => setAdding(false)}>Cancel</button></div></form> : <button className="btn outline" onClick={() => setAdding(true)}>Add an address</button>}</>}</div>}

      {tab === "returns" && <div>{!rets ? <p className="empty">Loading…</p> : rets.length === 0 ? <p className="empty">No return requests. <Link href="/returns" className="link">Start a return or exchange</Link></p> : rets.map((r) => <div key={r.ref} className="addr-card"><div><b>{r.ref}</b><em>{label(r.status)}</em><p>Order {r.orderNumber}<br />{r.items.map((i) => `${i.name} (${i.size}) · ${label(i.kind)}`).join(", ")}</p></div></div>)}</div>}

      {tab === "profile" && <form className="fields one" onSubmit={saveName}><label>Full name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label><label>Mobile number<input disabled value={`+91 ${user.phone}`} /></label><button className="btn" disabled={!name.trim()}>Save changes</button></form>}

      <div className="danger"><button className="link" onClick={() => { signOut(); toast("Signed out"); }}>Sign out</button><span>·</span><button className="link" onClick={del}>Delete my account</button></div>
    </div></>);
}
