"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adm, msg, setToken } from "@/lib/api";

export default function Login() {
  const router = useRouter(); const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const r = await adm<{ token: string }>("/admin/auth/login", { method: "POST", body: { email, password: pw } }); setToken(r.token); router.replace("/"); }
    catch (x) { setErr(msg(x)); setBusy(false); }
  };
  return (<div className="login"><form className="login-card" onSubmit={go}>
    <div className="brand"><img src="/brand/logo-horizontal-charcoal.png" alt="Jafson" width={150} height={49} /><small>Back-office</small></div><h1>Staff sign in</h1>
    <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
      <label>Email<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
      <label>Password<input type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label></div>
    {err && <p className="err-box" role="alert" style={{ marginTop: 0 }}>{err}</p>}
    <button className="btn" disabled={busy || !email || !pw}>{busy ? "Signing in…" : "Sign in"}</button>
  </form></div>);
}
