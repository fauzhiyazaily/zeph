import path from "path";
import { describe, expect, it, beforeAll } from "vitest";
import nextConfig from "../../../next.config";

// next.config.ts references path and __dirname; those resolve fine in Node/Vitest.

describe("next.config security headers", () => {
  let headers: Array<{ key: string; value: string }>;

  beforeAll(async () => {
    const result = await nextConfig.headers!();
    // All routes share one header block (source "/(.*)")
    headers = result[0].headers;
  });

  function header(key: string) {
    return headers.find((h) => h.key === key)?.value;
  }

  it("includes Strict-Transport-Security with preload", () => {
    const hsts = header("Strict-Transport-Security");
    expect(hsts).toBeDefined();
    expect(hsts).toContain("max-age=31536000");
    expect(hsts).toContain("includeSubDomains");
    expect(hsts).toContain("preload");
  });

  it("includes Content-Security-Policy with frame-ancestors none", () => {
    const csp = header("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("includes X-Content-Type-Options nosniff", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
  });

  it("includes X-Frame-Options DENY", () => {
    expect(header("X-Frame-Options")).toBe("DENY");
  });

  it("includes Referrer-Policy strict-origin-when-cross-origin", () => {
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("includes Permissions-Policy disabling sensitive capabilities", () => {
    const pp = header("Permissions-Policy");
    expect(pp).toBeDefined();
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("payment=()");
  });

  it("applies headers to all routes via catch-all source", () => {
    const result = nextConfig.headers!();
    return result.then((rules) => {
      expect(rules.length).toBeGreaterThanOrEqual(1);
      expect(rules[0].source).toBe("/(.*)")
    });
  });

  it("disables X-Powered-By header", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("keeps tracing scope local and includes shared ingestion package", () => {
    expect(nextConfig.outputFileTracingRoot).toBe(process.cwd());
    expect(nextConfig.outputFileTracingRoot).not.toBe(path.join(process.cwd(), ".."));

    const includes = nextConfig.outputFileTracingIncludes as Record<string, string[]> | undefined;
    expect(includes).toBeDefined();
    expect(includes?.["/*"]).toContain("../shared/ingestion/**/*");
  });
});
