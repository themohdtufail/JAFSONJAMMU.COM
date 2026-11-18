"use client";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adm, msg, setToken } from "@/lib/api";
import { PageHead, useAdmin } from "@/components/Shell";

function ChangePassword() {
  const { toast } = useAdmin(); const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [again, setAgain] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const go = async () => { setBusy(true); setErr(""); try { await adm("/admin/me/password", { method: "POST", body: { currentPassword: cur, newPassword: next } }); toast("Password changed"); setCur(""); setNext(""); setAgain(""); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  return (<div className="card" style={{ maxWidth: 620, marginTop: 16 }}><h2>Password</h2>
    <p style={{ marginBottom: 16 }}>Use a long phrase that you don't use anywhere else. At least 12 characters; it can't contain your email name.</p>
    <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
      <label>Current password<input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>
      <label>New password<input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
      <label>New password again<input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></label></div>
    {again && next !== again && <p className="err-box" role="alert" style={{ marginTop: 12 }}>The two new passwords don't match.</p>}{err && <p className="err-box" role="alert" style={{ marginTop: 12 }}>{err}</p>}
    <div className="actions" style={{ marginTop: 16 }}><button className="btn" onClick={go} disabled={busy || !cur || next.length < 12 || next !== again}>{busy ? "Saving…" : "Change password"}</button></div></div>);
}

export default function Security() {
  const { me, refreshMe, toast } = useAdmin(); const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qr: string } | null>(null); const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { document.title = "Security | Jafson Back-office"; }, []);
  const start = async () => { setBusy(true); setErr(""); try { const r = await adm<{ secret: string; otpauthUrl: string }>("/admin/auth/mfa/setup", { method: "POST" }); setSetup({ ...r, qr: await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 220 }) }); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  const enable = async () => { setBusy(true); setErr(""); try { const r = await adm<{ token: string }>("/admin/auth/mfa/enable", { method: "POST", body: { code } }); setToken(r.token); await refreshMe(); toast("Two-step login is on"); setSetup(null); setCode(""); router.replace("/"); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  if (!me) return null;
  return (<>
    <PageHead title="Security" sub="Protect this account. Managers and owners can change stock, prices and refunds." />
    {me.mfaRequired && !me.mfaEnabled && <div className="err-box" role="alert" style={{ marginBottom: 16 }}>Your role needs two-step login. Set it up below to use the back-office.</div>}
    <div className="card" style={{ maxWidth: 620 }}>
      <h2>Two-step login</h2>
      {me.mfaEnabled ? <p>On. Each sign-in asks for a 6-digit code from your authenticator app. If you lose your phone, ask an owner to reset it.</p> : !setup ? <>
        <p style={{ marginBottom: 16 }}>Use an authenticator app such as Google Authenticator, Microsoft Authenticator or Authy. Each sign-in will ask for a fresh 6-digit code, so a stolen password alone can't get in.</p>
        <button className="btn" onClick={start} disabled={busy}>{busy ? "Starting…" : "Set up two-step login"}</button></>
      : <div style={{ display: "grid", gap: 16 }}>
        <ol style={{ paddingLeft: 20, display: "grid", gap: 8 }}><li>Open your authenticator app and add an account by scanning this code.</li><li>Enter the 6-digit code it shows to finish.</li></ol>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}><img src={setup.qr} alt="QR code for your authenticator app" width={220} height={220} style={{ border: "1px solid var(--line)", borderRadius: 12 }} />
          <div><p style={{ color: "var(--mute)" }}>Can't scan? Enter this key manually:</p><code style={{ font: "600 16px var(--sans)", letterSpacing: ".08em", wordBreak: "break-all" }}>{setup.secret.match(/.{1,4}/g)?.join(" ")}</code></div></div>
        <div className="fields" style={{ gridTemplateColumns: "1fr" }}><label>6-digit code<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" /></label></div>
        {err && <p className="err-box">{err}</p>}
        <div className="actions"><button className="btn" onClick={enable} disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Turn on two-step login"}</button><button className="btn sec" onClick={() => { setSetup(null); setCode(""); setErr(""); }}>Cancel</button></div></div>}
      {err && !setup && <p className="err-box">{err}</p>}
    </div>
    <ChangePassword /></>);
}
