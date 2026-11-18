import { describe, expect, it } from "vitest";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { hashPassword, needsRehash, verifyPassword } from "./password";

describe("passwords", () => {
  it("hashes with Argon2id and verifies", async () => {
    const h = await hashPassword("correct horse battery"); expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true); expect(await verifyPassword("wrong", h)).toBe(false); expect(needsRehash(h)).toBe(false);
    expect(await hashPassword("correct horse battery")).not.toBe(h); // salted
  });
  it("still accepts earlier scrypt hashes and flags them for upgrade", async () => {
    const salt = randomBytes(16); const legacy = `${salt.toString("hex")}:${(await promisify(scrypt)("old-password", salt, 64) as Buffer).toString("hex")}`;
    expect(await verifyPassword("old-password", legacy)).toBe(true); expect(await verifyPassword("nope", legacy)).toBe(false); expect(needsRehash(legacy)).toBe(true);
  });
  it("rejects malformed stored values without throwing", async () => { expect(await verifyPassword("x", "")).toBe(false); expect(await verifyPassword("x", "$argon2id$garbage")).toBe(false); });
});

import { passwordProblem } from "./password";
describe("password rules", () => {
  it("accepts a long, varied password and says why it refuses others", () => {
    expect(passwordProblem("river-lantern-9-copper-field", "owner@example.com")).toBeNull();
    expect(passwordProblem("short1!", "a@b.co")).toContain("12 characters"); expect(passwordProblem("aaaaaaaaaaaaaaaa", "a@b.co")).toContain("repetitive");
    expect(passwordProblem("mohdafiqmt-2026-x", "mohdafiqmt@gmail.com")).toContain("email name"); expect(passwordProblem("MyPassword-2026!", "x@y.co")).toContain("easy to guess"); expect(passwordProblem("x".repeat(201) + "abcde", "x@y.co")).toContain("too long");
  });
});
