import { describe, expect, it } from "vitest";
import { allowedParentOrigin, parentOrigin } from "./embed";

describe("embed origin allow-list", () => {
  it("accepts Preconexa and local dev, rejects others", () => {
    expect(allowedParentOrigin("https://app.preconexa.com")).toBe("https://app.preconexa.com");
    expect(allowedParentOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(allowedParentOrigin("https://evil.example.com")).toBeNull();
    expect(allowedParentOrigin("https://preconexa.com.evil.io")).toBeNull();
    expect(allowedParentOrigin(null)).toBeNull();
  });
  it("is null when not embedded", () => {
    const w: any = { location: {} }; w.parent = w;
    expect(parentOrigin(w, w, "")).toBeNull();
  });
  it("prefers ancestorOrigins, falls back to referrer", () => {
    const top = {}; const w: any = { parent: top, location: { ancestorOrigins: ["https://app.preconexa.com"] } };
    expect(parentOrigin(w, {}, "")).toBe("https://app.preconexa.com");
    const w2: any = { parent: top, location: {} };
    expect(parentOrigin(w2, {}, "https://app.preconexa.com/takeoff")).toBe("https://app.preconexa.com");
    expect(parentOrigin(w2, {}, "https://other.com/x")).toBeNull();
  });
});
