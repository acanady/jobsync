import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getBatchMatchSetup,
  getBatchMatchStatus,
  startBatchMatch,
  cancelBatchMatch,
} from "@/actions/job.actions";
import { BatchMatchDialog } from "@/components/myjobs/batch-match/BatchMatchDialog";
import { BatchMatchProgress } from "@/components/myjobs/batch-match/BatchMatchProgress";
import { useBatchMatch, BATCH_POLL_MS } from "@/components/myjobs/batch-match/useBatchMatch";
import type { BatchMatchItem, BatchMatchState } from "@/models/batchMatch.model";

vi.mock("@/actions/job.actions", () => ({
  getBatchMatchSetup: vi.fn(),
  getBatchMatchStatus: vi.fn(),
  startBatchMatch: vi.fn(),
  cancelBatchMatch: vi.fn(),
  clearBatchMatch: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

const item = (n: number, status: BatchMatchItem["status"], extra: Partial<BatchMatchItem> = {}): BatchMatchItem => ({
  jobId: `job-${n}`,
  title: `Engineer ${n}`,
  company: `Acme ${n}`,
  status,
  ...extra,
});
const batch = (items: BatchMatchItem[], extra: Partial<BatchMatchState> = {}): BatchMatchState => ({
  id: "b1",
  resumeId: "res-a",
  resumeTitle: "Main resume",
  status: "running",
  startedAt: "2026-10-30T12:00:00Z",
  cancelRequested: false,
  items,
  ...extra,
});

describe("BatchMatchDialog", () => {
  const user = userEvent.setup();
  beforeEach(() => {
    vi.clearAllMocks();
    (getBatchMatchSetup as any).mockResolvedValue({
      success: true,
      data: {
        total: 5,
        scoredCount: 2,
        resumes: [{ id: "res-a", title: "Main resume" }, { id: "res-b", title: "Other" }],
        suggestedResumeId: "res-a",
      },
    });
  });

  it("starts with the suggested resume, skipping scored jobs by default", async () => {
    const onStart = vi.fn(async () => true);
    const onOpenChange = vi.fn();
    render(<BatchMatchDialog open onOpenChange={onOpenChange} jobIds={["1", "2", "3", "4", "5"]} onStart={onStart} />);

    expect(await screen.findByText("Main resume")).toBeInTheDocument();
    expect(getBatchMatchSetup).toHaveBeenCalledWith(["1", "2", "3", "4", "5"]);
    expect(screen.getByText(/2 jobs already have one/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Match 3 jobs" }));
    expect(onStart).toHaveBeenCalledWith("res-a", true);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("re-matches every job when skipping is turned off", async () => {
    const onStart = vi.fn(async () => true);
    render(<BatchMatchDialog open onOpenChange={vi.fn()} jobIds={["1", "2", "3", "4", "5"]} onStart={onStart} />);
    await user.click(await screen.findByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Match 5 jobs" }));
    expect(onStart).toHaveBeenCalledWith("res-a", false);
  });

  it("stays open when the start fails", async () => {
    const onOpenChange = vi.fn();
    render(<BatchMatchDialog open onOpenChange={onOpenChange} jobIds={["1"]} onStart={async () => false} />);
    await user.click(await screen.findByRole("button", { name: /^Match/ }));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("can't start when every job is already matched", async () => {
    (getBatchMatchSetup as any).mockResolvedValue({
      success: true,
      data: { total: 2, scoredCount: 2, resumes: [{ id: "res-a", title: "Main resume" }], suggestedResumeId: "res-a" },
    });
    render(<BatchMatchDialog open onOpenChange={vi.fn()} jobIds={["1", "2"]} onStart={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Nothing to match" })).toBeDisabled();
  });

  it("asks for a resume when there is none", async () => {
    (getBatchMatchSetup as any).mockResolvedValue({
      success: true,
      data: { total: 1, scoredCount: 0, resumes: [], suggestedResumeId: null },
    });
    render(<BatchMatchDialog open onOpenChange={vi.fn()} jobIds={["1"]} onStart={vi.fn()} />);
    expect(await screen.findByText(/Add a resume in Profile/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Match/ })).toBeDisabled();
  });
});

describe("BatchMatchProgress", () => {
  const user = userEvent.setup();

  it("shows the job in flight and cancels", async () => {
    const onCancel = vi.fn();
    render(
      <BatchMatchProgress
        state={batch([item(1, "matched", { matchScore: 80 }), item(2, "running"), item(3, "pending")])}
        onCancel={onCancel}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("AI matching 2 of 3")).toBeInTheDocument();
    expect(screen.getByText(/Engineer 2 @ Acme 2/)).toBeInTheDocument();
    expect(screen.getByText(/Matching against Main resume\. 1 matched/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("summarizes a finished batch with the problems behind Details", async () => {
    const onClear = vi.fn();
    render(
      <BatchMatchProgress
        state={batch(
          [
            item(1, "matched", { matchScore: 80 }),
            item(2, "skipped", { message: "The job description is missing or too short to match" }),
            item(3, "failed", { message: "fetch failed" }),
          ],
          { status: "completed" },
        )}
        onCancel={vi.fn()}
        onClear={onClear}
      />,
    );
    expect(screen.getByText("AI matching finished")).toBeInTheDocument();
    expect(screen.getByText("1 matched, 1 skipped, 1 failed")).toBeInTheDocument();
    expect(screen.queryByText(/fetch failed/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText(/failed: fetch failed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Engineer 2 @ Acme 2" })).toHaveAttribute("href", "/dashboard/myjobs/job-2");
    await user.click(screen.getByRole("button", { name: "Close AI matching summary" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("says when a cancel is under way", () => {
    render(
      <BatchMatchProgress state={batch([item(1, "running")], { cancelRequested: true })} onCancel={vi.fn()} onClear={vi.fn()} />,
    );
    expect(screen.getByText("Cancelling AI matching…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});

describe("useBatchMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it("picks up a running batch, polls it, and reports each score once", async () => {
    const statuses = [
      batch([item(1, "running"), item(2, "pending")]),
      batch([item(1, "matched", { matchScore: 81 }), item(2, "running")]),
      batch([item(1, "matched", { matchScore: 81 }), item(2, "matched", { matchScore: 64 })], { status: "completed" }),
    ];
    (getBatchMatchStatus as any).mockImplementation(async () => ({ success: true, data: statuses.shift() ?? null }));
    const onScores = vi.fn();
    const { result } = renderHook(() => useBatchMatch(onScores));

    await waitFor(() => expect(result.current.running).toBe(true));
    await act(async () => vi.advanceTimersByTime(BATCH_POLL_MS));
    await waitFor(() => expect(onScores).toHaveBeenCalledTimes(1));
    expect(onScores.mock.calls[0][0]).toEqual(new Map([["job-1", 81]]));

    await act(async () => vi.advanceTimersByTime(BATCH_POLL_MS));
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(onScores).toHaveBeenCalledTimes(2);
    expect(onScores.mock.calls[1][0]).toEqual(new Map([["job-2", 64]]));

    // Finished: no more polling.
    const calls = (getBatchMatchStatus as any).mock.calls.length;
    await act(async () => vi.advanceTimersByTime(BATCH_POLL_MS * 3));
    expect((getBatchMatchStatus as any).mock.calls.length).toBe(calls);
  });

  it("starts a batch and cancels it", async () => {
    (getBatchMatchStatus as any).mockResolvedValue({ success: true, data: null });
    (startBatchMatch as any).mockResolvedValue({ success: true, data: batch([item(1, "pending")]) });
    (cancelBatchMatch as any).mockResolvedValue({ success: true, data: true });
    const { result } = renderHook(() => useBatchMatch(vi.fn()));
    await waitFor(() => expect(getBatchMatchStatus).toHaveBeenCalled());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.start(["job-1"], "res-a", true);
    });
    expect(ok).toBe(true);
    expect(startBatchMatch).toHaveBeenCalledWith({ jobIds: ["job-1"], resumeId: "res-a", skipScored: true });
    expect(result.current.running).toBe(true);

    await act(async () => result.current.cancel());
    expect(cancelBatchMatch).toHaveBeenCalled();
  });

  it("returns false and keeps no state when the start is refused", async () => {
    (getBatchMatchStatus as any).mockResolvedValue({ success: true, data: null });
    (startBatchMatch as any).mockResolvedValue({ success: false, message: "A batch is already matching" });
    const { result } = renderHook(() => useBatchMatch(vi.fn()));
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.start(["job-1"], "res-a", true);
    });
    expect(ok).toBe(false);
    expect(result.current.state).toBeNull();
  });
});
