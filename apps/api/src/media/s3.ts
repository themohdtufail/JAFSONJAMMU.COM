import { createHash, createHmac } from "node:crypto";

/**
 * Minimal AWS Signature V4 for S3-compatible storage (Cloudflare R2, Supabase Storage, AWS S3, MinIO). No SDK, so nothing heavy is shipped.
 * Path-style addressing: https://host/bucket/key.
 */
export interface S3Conf { endpoint: string; bucket: string; region: string; accessKey: string; secretKey: string }
const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
const sha = (d: string | Buffer) => createHash("sha256").update(d).digest("hex");
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const encPath = (p: string) => p.split("/").map(enc).join("/");
const stamp = (d: Date) => d.toISOString().replace(/[:-]|\.\d{3}/g, "");
const signingKey = (secret: string, date: string, region: string) => hmac(hmac(hmac(hmac("AWS4" + secret, date), region), "s3"), "aws4_request");

/** A URL that lets the holder PUT (or GET/HEAD) one object for a limited time, without ever seeing the secret key. */
export function presign(c: S3Conf, method: "GET" | "PUT" | "HEAD", key: string, expires = 900, now = new Date(), host?: string, pathStyle = true) {
  const u = new URL(c.endpoint); const h = host ?? u.host; const date = stamp(now), day = date.slice(0, 8), scope = `${day}/${c.region}/s3/aws4_request`;
  const path = pathStyle ? `/${c.bucket}/${encPath(key)}` : `/${encPath(key)}`;
  const q: Record<string, string> = { "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${c.accessKey}/${scope}`, "X-Amz-Date": date, "X-Amz-Expires": String(expires), "X-Amz-SignedHeaders": "host" };
  const canonQuery = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k]!)}`).join("&");
  const canonical = [method, path, canonQuery, `host:${h}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sts = ["AWS4-HMAC-SHA256", date, scope, sha(canonical)].join("\n");
  const sig = createHmac("sha256", signingKey(c.secretKey, day, c.region)).update(sts).digest("hex");
  return `${u.protocol}//${h}${path}?${canonQuery}&X-Amz-Signature=${sig}`;
}

/** Headers for a request the server makes itself (it knows the body, so the body hash is signed). */
export function signedHeaders(c: S3Conf, method: "PUT" | "DELETE" | "HEAD", key: string, body: Buffer | null, contentType?: string, now = new Date()) {
  const u = new URL(c.endpoint); const date = stamp(now), day = date.slice(0, 8), scope = `${day}/${c.region}/s3/aws4_request`; const path = `/${c.bucket}/${encPath(key)}`; const payload = sha(body ?? "");
  const hs: Record<string, string> = { host: u.host, "x-amz-content-sha256": payload, "x-amz-date": date, ...(contentType ? { "content-type": contentType } : {}) };
  const names = Object.keys(hs).sort();
  const canonical = [method, path, "", names.map((n) => `${n}:${hs[n]}`).join("\n") + "\n", names.join(";"), payload].join("\n");
  const sts = ["AWS4-HMAC-SHA256", date, scope, sha(canonical)].join("\n");
  const sig = createHmac("sha256", signingKey(c.secretKey, day, c.region)).update(sts).digest("hex");
  return { url: `${u.protocol}//${u.host}${path}`, headers: { ...hs, authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` } as Record<string, string> };
}
