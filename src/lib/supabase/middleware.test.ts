import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const createServerClientMock = vi.fn(() => ({
  auth: {
    getUser: getUserMock,
  },
}));

const redirectMock = vi.fn((url: URL) => ({
  kind: "redirect",
  status: 307,
  headers: { location: url.toString() },
  url,
}));

const nextMock = vi.fn(({ request }: { request: RequestLike }) => ({
  kind: "next",
  request,
  cookies: {
    set: vi.fn(),
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: ({ request }: { request: RequestLike }) => nextMock({ request }),
    redirect: (url: URL) => redirectMock(url),
  },
}));

type RequestLike = {
  nextUrl: URL & { clone: () => URL };
  cookies: {
    getAll: () => Array<{ name: string; value: string }>;
    set: (name: string, value: string) => void;
  };
};

function createRequest(path: string): RequestLike {
  const url = new URL(`http://localhost:3000${path}`);
  return {
    nextUrl: Object.assign(url, {
      clone: () => new URL(url.toString()),
    }),
    cookies: {
      getAll: () => [],
      set: vi.fn(),
    },
  };
}

describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("redirects unauthenticated protected route requests to sign-in with next path", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { updateSession } = await import("@/lib/supabase/middleware");

    const request = createRequest("/dashboard?tab=overview");
    const response = await updateSession(request as never);

    expect(response.kind).toBe("redirect");
    expect(response.headers.location).toContain("/sign-in");
    expect(response.headers.location).toContain("next=%2Fdashboard%3Ftab%3Doverview");
  });

  it("keeps signed-in users on protected routes", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { updateSession } = await import("@/lib/supabase/middleware");

    const request = createRequest("/dashboard");
    const response = await updateSession(request as never);

    expect(response.kind).toBe("next");
  });

  it("redirects unauthenticated chat route requests to sign-in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { updateSession } = await import("@/lib/supabase/middleware");

    const request = createRequest("/chat");
    const response = await updateSession(request as never);

    expect(response.kind).toBe("redirect");
    expect(response.headers.location).toContain("/sign-in");
    expect(response.headers.location).toContain("next=%2Fchat");
  });

  it("redirects signed-in users away from auth pages", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const { updateSession } = await import("@/lib/supabase/middleware");

    const request = createRequest("/sign-in");
    const response = await updateSession(request as never);

    expect(response.kind).toBe("redirect");
    expect(response.headers.location).toContain("/dashboard");
  });
});
