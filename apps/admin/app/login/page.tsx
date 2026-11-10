"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adm, msg, setToken } from "@/lib/api";

type Login = { token: string; mfaSetupRequired?: boolean } | { mfaRequired: true; challenge: string };

export default function Login() {
  const router = useRouter(); const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState(""); const [code, setCode] = useState("");
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      if (challenge) { const r = await adm<{ token: string }>("/admin/auth/mfa/verify", { method: "POST", body: { challenge, code } }); setToken(r.token); router.replace("/"); return; }
      const r = await adm<Login>("/admin/auth/login", { method: "POST", body: { email, password: pw } });
      if ("mfaRequired" in r) { setChallenge(r.challenge); setBusy(false); return; }
      setToken(r.token); router.replace(r.mfaSetupRequired ? "/security" : "/");
    } catch (x) { setErr(msg(x)); setBusy(false); if (challenge && /expired/i.test(msg(x))) { setChallenge(""); setCode(""); } }
  };
  return (<div className="login"><form className="login-card" onSubmit={go}>
    <div className="brand"><img src="/brand/logo-horizontal-charcoal.png" alt="Jafson" width={150} height={49} /><small>Back-office</small></div><h1>{challenge ? "Enter your code" : "Staff sign in"}</h1>
    {challenge ? <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
      <label>6-digit code from your authenticator app<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" autoFocus /></label></div>
    : <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
      <label>Email<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
      <label>Password<input type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label></div>}
    {err && <p className="err-box" role="alert" style={{ marginTop: 0 }}>{err}</p>}
    <button className="btn" disabled={busy || (challenge ? code.length !== 6 : !email || !pw)}>{busy ? "Signing in…" : challenge ? "Verify and sign in" : "Sign in"}</button>
    {challenge && <button type="button" className="btn sec" onClick={() => { setChallenge(""); setCode(""); setErr(""); }}>Back</button>}
  </form></div>);
}
