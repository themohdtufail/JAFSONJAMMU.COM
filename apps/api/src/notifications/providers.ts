import { cfg } from "../common/config";

/** Delivery providers. Each takes already-decided content and talks to one external service. A provider that cannot deliver throws, so callers can retry or refuse. */
export interface SmsProvider { name: string; sendOtp(phone: string, code: string): Promise<void>; sendTemplate(phone: string, template: string, vars: Record<string, string>, text: string): Promise<void> }
export interface EmailProvider { name: string; send(to: string, subject: string, text: string, html: string): Promise<void> }

const e164 = (p: string) => `91${p}`;
const post = async (url: string, headers: Record<string, string>, body: unknown, what: string) => {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    if (!r.ok) throw new Error(`${what} responded ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
    return r;
  } catch (e) { if ((e as Error).name === "AbortError") throw new Error(`${what} timed out`); throw e; } finally { clearTimeout(t); }
};

/** Development stand-in: writes to the log, never leaves the machine. Refused as the OTP channel in production. */
export const logSms: SmsProvider = {
  name: "log",
  async sendOtp(phone) { console.log(`[sms:log] OTP for ${phone} generated (not delivered)`); },
  async sendTemplate(phone, template, _v, text) { console.log(`[sms:log] ${template} to ${phone}: ${text}`); },
};
export const logEmail: EmailProvider = { name: "log", async send(to, subject) { console.log(`[email:log] to ${to}: ${subject}`); } };

/** MSG91 (India). The OTP and Flow APIs both need DLT-registered templates, set up in the MSG91 dashboard. */
export const msg91 = (): SmsProvider => {
  const c = cfg(), h = { authkey: c.msg91AuthKey }, base = c.msg91Base;
  return {
    name: "msg91",
    async sendOtp(phone, code) {
      if (!c.msg91OtpTemplate) throw new Error("MSG91_OTP_TEMPLATE_ID is not set");
      await post(`${base}/api/v5/otp?template_id=${encodeURIComponent(c.msg91OtpTemplate)}&mobile=${e164(phone)}&otp=${code}`, h, {}, "MSG91 OTP");
    },
    async sendTemplate(phone, template, vars) {
      const id = c.msg91Templates[template]; if (!id) throw new Error(`No MSG91 template id configured for ${template} (MSG91_TEMPLATES)`);
      await post(`${base}/api/v5/flow`, h, { template_id: id, short_url: "0", recipients: [{ mobiles: e164(phone), ...vars }] }, "MSG91 flow");
    },
  };
};

/** Resend (email over HTTPS). */
export const resend = (): EmailProvider => {
  const c = cfg();
  return { name: "resend", async send(to, subject, text, html) { await post(`${c.resendBase}/emails`, { authorization: `Bearer ${c.resendApiKey}` }, { from: c.emailFrom, to: [to], subject, text, html }, "Resend"); } };
};

export const smsProvider = (): SmsProvider => (cfg().smsProvider === "msg91" ? msg91() : logSms);
export const emailProvider = (): EmailProvider => (cfg().emailProvider === "resend" ? resend() : logEmail);
