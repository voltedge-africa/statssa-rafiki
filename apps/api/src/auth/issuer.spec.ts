import { describe, expect, it } from "vite-plus/test";
import { issuerFor } from "./issuer.ts";

const base = { authPort: "3000" };

describe("issuerFor", () => {
  it("uses the override when set", () => {
    expect(issuerFor({ headers: {} }, { ...base, override: "https://auth.example" })).toBe(
      "https://auth.example",
    );
  });

  it("derives the issuer from the request host", () => {
    expect(issuerFor({ headers: { host: "localhost:3002" } }, base)).toBe("http://localhost:3000");
  });

  it("honours forwarded headers from a proxy", () => {
    const request = {
      headers: { "x-forwarded-proto": "https", "x-forwarded-host": "rafiki.ts.net" },
    };
    expect(issuerFor(request, base)).toBe("https://rafiki.ts.net:3000");
  });

  it("falls back to localhost", () => {
    expect(issuerFor({ headers: {} }, base)).toBe("http://localhost:3000");
  });
});
