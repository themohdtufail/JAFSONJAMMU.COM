import { describe, expect, it } from "vitest";
import { presign } from "./s3";

describe("S3 signing", () => {
  it("matches the official AWS Signature V4 query-string example byte for byte", () => {
    // From AWS docs "Authenticating Requests: Using Query Parameters": GET https://examplebucket.s3.amazonaws.com/test.txt, expires 86400.
    const url = presign({ endpoint: "https://s3.amazonaws.com", bucket: "examplebucket", region: "us-east-1", accessKey: "AKIAIOSFODNN7EXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" }, "GET", "test.txt", 86400, new Date("2013-05-24T00:00:00Z"), "examplebucket.s3.amazonaws.com", false);
    expect(url).toBe("https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
  });
  it("signs PUT and different keys differently, and encodes odd characters in keys", () => {
    const c = { endpoint: "https://acct.r2.cloudflarestorage.com", bucket: "jafson", region: "auto", accessKey: "k", secretKey: "s" }; const now = new Date("2026-11-20T10:00:00Z");
    const a = presign(c, "PUT", "media/a b.mp4", 600, now), b = presign(c, "PUT", "media/c.mp4", 600, now), g = presign(c, "GET", "media/c.mp4", 600, now);
    expect(a).toContain("/jafson/media/a%20b.mp4?"); expect(new URL(a).searchParams.get("X-Amz-Signature")).not.toBe(new URL(b).searchParams.get("X-Amz-Signature")); expect(new URL(b).searchParams.get("X-Amz-Signature")).not.toBe(new URL(g).searchParams.get("X-Amz-Signature")); expect(new URL(a).searchParams.get("X-Amz-Expires")).toBe("600");
  });
});
