import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

vi.mock("@prisma/client", () => {
  const m = {
    automationRun: { updateMany: vi.fn() },
    automation: { count: vi.fn(), findMany: vi.fn() },
  };
  return { PrismaClient: vi.fn(function () { return m; }) };
});

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn(() => ({ stop: vi.fn() })), validate: vi.fn(() => true) },
}));

vi.mock("@/lib/scraper/runner", () => ({
  runAutomation: vi.fn(),
  AutomationAlreadyRunningError: class extends Error {},
}));

import cron from "node-cron";
import { startScheduler, stopScheduler } from "@/lib/scheduler";

describe("scheduler due query", () => {
  afterEach(() => stopScheduler());

  it("runs company boards and the JobSpy search board, never a retired board", async () => {
    (prisma.automation.findMany as any).mockResolvedValue([]);
    startScheduler();
    const runDue = (cron.schedule as any).mock.calls[0][1] as () => Promise<void>;
    await runDue();

    const where = (prisma.automation.findMany as any).mock.calls[0][0].where;
    expect(where.jobBoard.in).toEqual(["greenhouse", "lever", "ashby", "jobspy"]);
    expect(where.jobBoard.in).not.toContain("jsearch");
  });
});
