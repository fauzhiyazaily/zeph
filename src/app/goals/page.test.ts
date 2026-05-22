import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});

const createServerSupabaseClientMock = vi.fn();
const evaluateGoalMilestonesMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (target: string) => redirectMock(target),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) =>
    createElement("a", { href }, children),
}));

vi.mock("@/app/components/app-shell", () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

vi.mock("@/app/goals/actions", () => ({
  deleteGoal: vi.fn(),
  saveGoal: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => createServerSupabaseClientMock(),
}));

vi.mock("@/lib/goals/milestones", () => ({
  evaluateGoalMilestones: (...args: unknown[]) => evaluateGoalMilestonesMock(...args),
}));

function createBuilder(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
}

async function renderGoalsPage(input: {
  currentAmount: number;
  milestones?: Array<{
    id: string;
    user_id: string;
    goal_id: string;
    milestone: 25 | 50 | 75 | 100;
    progress_percent: number;
    message: string;
    created_at: string;
  }>;
}) {
  const goalsBuilder = createBuilder([
    {
      id: "g1",
      user_id: "u1",
      name: "Emergency Fund",
      target_amount: 100000,
      current_amount: input.currentAmount,
      deadline: "2026-12-31",
      notes: null,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-22T00:00:00.000Z",
    },
  ]);

  const milestonesBuilder = createBuilder(input.milestones ?? []);

  const fromMock = vi
    .fn()
    .mockReturnValueOnce(goalsBuilder)
    .mockReturnValueOnce(milestonesBuilder);

  createServerSupabaseClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    from: fromMock,
  });

  const { default: GoalsPage } = await import("@/app/goals/page");
  const element = await GoalsPage({ searchParams: Promise.resolve({}) });
  return renderToStaticMarkup(element);
}

describe("goals page progress visualization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    evaluateGoalMilestonesMock.mockResolvedValue(undefined);
  });

  it("renders progress text and bar width from current goal amounts", async () => {
    const html = await renderGoalsPage({ currentAmount: 25000 });

    expect(html).toContain("(25%)");
    expect(html).toContain("width:25%");
    expect(html).toContain("Need INR");
  });

  it("updates visualization when underlying goal amounts change", async () => {
    const lowHtml = await renderGoalsPage({ currentAmount: 10000 });
    const highHtml = await renderGoalsPage({ currentAmount: 75000 });

    expect(lowHtml).toContain("(10%)");
    expect(lowHtml).toContain("width:10%");

    expect(highHtml).toContain("(75%)");
    expect(highHtml).toContain("width:75%");
  });

  it("redirects unauthenticated users to sign-in", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    const { default: GoalsPage } = await import("@/app/goals/page");

    await expect(GoalsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/sign-in",
    );
  });

  it("renders completed milestone entries in goal activity history", async () => {
    const html = await renderGoalsPage({
      currentAmount: 76000,
      milestones: [
        {
          id: "m1",
          user_id: "u1",
          goal_id: "g1",
          milestone: 75,
          progress_percent: 76,
          message: "Milestone reached: Emergency Fund at 75%. Keep going.",
          created_at: "2026-05-22T10:00:00.000Z",
        },
      ],
    });

    expect(html).toContain("Goal activity history");
    expect(html).toContain("Emergency Fund");
    expect(html).toContain("Milestone reached: Emergency Fund at 75%. Keep going.");
    expect(html).toContain("75%");
  });
});
