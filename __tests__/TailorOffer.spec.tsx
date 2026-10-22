import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const sendMessage = vi.fn();
vi.mock("@/components/agent/AgentChatProvider", () => ({
  useAgentChat: () => ({ sendMessage }),
}));

import { AgentResultCard } from "@/components/agent/AgentResultCard";

const matchPart = (toolCallId: string, output: unknown) =>
  ({ type: "tool-match_job", toolCallId, state: "output-available", input: {}, output }) as any;

const okMatch = {
  status: "ok",
  jobId: "job-1",
  jobTitle: "Integration Engineer",
  company: "Acme",
  resumeId: "r1",
  resumeTitle: "Software Dev Resume",
  scores: { matchScore: 82 },
  body: "## Summary\n\nGood fit.",
  saved: true,
};

describe("tailoring offer on the match card", () => {
  const user = userEvent.setup();
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("asks, and on Yes asks the chat to tailor the resume that was matched", async () => {
    render(<AgentResultCard part={matchPart("m1", okMatch)} />);
    expect(screen.getByText("Want me to tailor your resume to this job?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /yes, tailor it/i }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      parts: [{ type: "text", text: 'Tailor my resume "Software Dev Resume" to this job' }],
    });
    expect(screen.queryByRole("button", { name: /yes, tailor it/i })).toBeNull();
  });

  it("sends nothing on No and hides the question", async () => {
    render(<AgentResultCard part={matchPart("m2", okMatch)} />);
    await user.click(screen.getByRole("button", { name: /no thanks/i }));
    expect(sendMessage).not.toHaveBeenCalled();
    expect(screen.queryByText(/tailor your resume to this job/)).toBeNull();
  });

  it("does not ask again for a card already answered", async () => {
    const { unmount } = render(<AgentResultCard part={matchPart("m3", okMatch)} />);
    await user.click(screen.getByRole("button", { name: /no thanks/i }));
    unmount();
    render(<AgentResultCard part={matchPart("m3", okMatch)} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /yes, tailor it/i })).toBeNull());
  });

  it("offers nothing when the match did not succeed", () => {
    render(
      <AgentResultCard
        part={matchPart("m4", { status: "generation_failed", jobTitle: "X", reason: "timeout" })}
      />,
    );
    expect(screen.queryByRole("button", { name: /yes, tailor it/i })).toBeNull();
  });
});
