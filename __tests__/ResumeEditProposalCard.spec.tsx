import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const sendMessage = vi.fn();
vi.mock("@/components/agent/AgentChatProvider", () => ({
  useAgentChat: () => ({ sendMessage }),
}));
vi.mock("@/actions/profile.actions", () => ({ applyResumeEdits: vi.fn() }));

import { AgentResultCard } from "@/components/agent/AgentResultCard";
import { applyResumeEdits } from "@/actions/profile.actions";

const apply = applyResumeEdits as unknown as ReturnType<typeof vi.fn>;

const proposal = {
  resumeId: "r1",
  resumeTitle: "Software Dev Resume",
  job: { id: "job-1", title: "Integration Engineer", company: "Acme" },
  edits: {
    headline: "Systems Integration Engineer",
    skills: [{ category: "Languages", skills: ["C++", "Python", "Bash"] }],
    experiences: [
      { company: "Cisco Systems Inc", jobTitle: "Software Engineer II", paragraphs: [], bullets: ["New bullet"] },
    ],
  },
  before: {
    headline: "Engineer",
    hasSummarySection: false,
    skills: [{ category: "Languages", skills: ["Python", "C++", "MATLAB"] }],
    experiences: [
      { company: "Cisco Systems Inc", jobTitle: "Software Engineer II", paragraphs: [], bullets: ["Old bullet"] },
    ],
  },
  warnings: ["Left out skills that aren't on the resume: Rust."],
  notes: ["Led with systems work."],
};

const part = (toolCallId: string, output: unknown = { status: "ok", proposal }) =>
  ({ type: "tool-tailor_resume", toolCallId, state: "output-available", input: {}, output }) as any;

describe("resume edit proposal card", () => {
  const user = userEvent.setup();
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows before and after, warnings, and removed skills", () => {
    render(<AgentResultCard part={part("c1")} />);
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    expect(screen.getByText("Systems Integration Engineer")).toBeInTheDocument();
    expect(screen.getByText(/aren't on the resume: Rust/)).toBeInTheDocument();
    expect(screen.getByText("MATLAB")).toBeInTheDocument();
    expect(screen.getByText("New bullet")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Software Dev Resume — Acme Integration Engineer")).toBeInTheDocument();
  });

  it("saves a tailored copy with exactly the shown edits and the job link", async () => {
    apply.mockResolvedValue({ success: true, resumeId: "r2", resumeTitle: "Copy title", mode: "copy" });
    render(<AgentResultCard part={part("c2")} />);

    await user.click(screen.getByRole("button", { name: "Save as tailored copy" }));

    expect(apply).toHaveBeenCalledWith({
      resumeId: "r1",
      mode: "copy",
      jobId: "job-1",
      copyTitle: "Software Dev Resume — Acme Integration Engineer",
      edits: proposal.edits,
    });
    expect(await screen.findByRole("link", { name: "Copy title" })).toHaveAttribute(
      "href",
      "/dashboard/profile/resume/r2",
    );
    expect(screen.queryByRole("button", { name: "Update this resume" })).toBeNull();
  });

  it("updates in place and remembers the outcome for the same card", async () => {
    apply.mockResolvedValue({ success: true, resumeId: "r1", resumeTitle: "Software Dev Resume", mode: "in_place" });
    const { unmount } = render(<AgentResultCard part={part("c3")} />);
    await user.click(screen.getByRole("button", { name: "Update this resume" }));
    expect(apply.mock.calls[0][0]).toMatchObject({ mode: "in_place", copyTitle: undefined });
    await screen.findByText(/^Updated/);
    unmount();

    render(<AgentResultCard part={part("c3")} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Update this resume" })).toBeNull());
  });

  it("shows the error and keeps the buttons when applying fails", async () => {
    apply.mockResolvedValue({ success: false, message: "Resume not found." });
    render(<AgentResultCard part={part("c4")} />);
    await user.click(screen.getByRole("button", { name: "Update this resume" }));
    expect(await screen.findByText("Resume not found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as tailored copy" })).toBeEnabled();
  });

  it("discards without writing", async () => {
    render(<AgentResultCard part={part("c5")} />);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByText(/nothing was changed/)).toBeInTheDocument();
  });

  it("renders update_resume proposals and non-ok results", () => {
    render(
      <AgentResultCard
        part={{
          type: "tool-update_resume",
          toolCallId: "c6",
          state: "output-available",
          input: {},
          output: { status: "no_changes", resumeTitle: "Main", warnings: ["Already says that."] },
        } as any}
      />,
    );
    expect(screen.getByText("Already says that.")).toBeInTheDocument();
  });
});
