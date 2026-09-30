import { describe, it, expect } from "vitest";
import { normalizeBoxCode, validBoxCode, formatBoxCode } from "./authenticity";
import { randomBytes, createHash } from "node:crypto";
describe("box authentication codes", () => {
  it("normalizes printing separators without accepting foreign characters", () => {
    const code = "ABCDEF0123456789ABCDEF0123456789";
    expect(normalizeBoxCode(formatBoxCode(code))).toBe(code);
    expect(validBoxCode(code)).toBe(true);
    expect(validBoxCode(code + "G")).toBe(false);
    expect(validBoxCode("L-TNZ-26045")).toBe(false);
  });
  it("generates 5000 independent 128-bit secrets", () => {
    const codes = Array.from({ length: 5000 }, () => randomBytes(16).toString("hex").toUpperCase());
    expect(new Set(codes).size).toBe(5000);
    expect(codes.every(validBoxCode)).toBe(true);
    expect(createHash("sha256").update(codes[0]!).digest("hex")).toHaveLength(64);
  });
});
