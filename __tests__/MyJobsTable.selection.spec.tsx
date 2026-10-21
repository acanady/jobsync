import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyJobsTable from "@/components/myjobs/MyJobsTable";
import { BulkActionsBar } from "@/components/myjobs/jobs-container/BulkActionsBar";
import type { JobResponse, JobStatus } from "@/models/job.model";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/agent/AgentChatProvider", () => ({
  useAgentChat: () => ({ busy: false }),
}));

const statuses: JobStatus[] = [{ id: "1", label: "Applied", value: "applied" }];

function makeJob(id: string, overrides: Partial<JobResponse> = {}): JobResponse {
  return {
    id,
    userId: "user-1",
    JobTitle: { id, label: `Engineer ${id}`, value: `engineer ${id}` },
    Company: { id: "1", label: "Acme", value: "acme", logoUrl: "" },
    Status: { id: "1", label: "Applied", value: "applied" },
    Location: null,
    JobSource: null,
    jobType: "FT",
    createdAt: new Date("2024-06-01"),
    appliedDate: null as unknown as Date,
    dueDate: new Date("2099-01-01"),
    salaryRange: "",
    description: "",
    jobUrl: "",
    applied: false,
    ...overrides,
  } as JobResponse;
}

function renderTable(selected: string[] = []) {
  const onToggleSelect = vi.fn();
  const onToggleSelectAll = vi.fn();
  render(
    <MyJobsTable
      jobs={[makeJob("a"), makeJob("b")]}
      jobStatuses={statuses}
      deleteJob={vi.fn()}
      editJob={vi.fn()}
      onChangeJobStatus={vi.fn()}
      onAddNote={vi.fn()}
      sort={null}
      onSort={vi.fn()}
      selectedIds={new Set(selected)}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
    />,
  );
  return { onToggleSelect, onToggleSelectAll };
}

describe("MyJobsTable selection", () => {
  const user = userEvent.setup();

  it("toggles a single row", async () => {
    const { onToggleSelect } = renderTable();
    await user.click(screen.getByLabelText("Select Engineer b"));
    expect(onToggleSelect).toHaveBeenCalledWith("b", true);
  });

  it("selects all loaded jobs from the header", async () => {
    const { onToggleSelectAll } = renderTable();
    await user.click(screen.getByLabelText("Select all loaded jobs"));
    expect(onToggleSelectAll).toHaveBeenCalledWith(true);
  });

  it("shows the header as partially selected", () => {
    renderTable(["a"]);
    const header = screen.getByLabelText(
      "Select all loaded jobs",
    ) as HTMLInputElement;
    expect(header.checked).toBe(false);
    expect(header.indeterminate).toBe(true);
  });

  it("hides checkboxes when selection is not wired", () => {
    render(
      <MyJobsTable
        jobs={[makeJob("a")]}
        jobStatuses={statuses}
        deleteJob={vi.fn()}
        editJob={vi.fn()}
        onChangeJobStatus={vi.fn()}
        onAddNote={vi.fn()}
        sort={null}
        onSort={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Select all loaded jobs")).toBeNull();
  });
});

describe("BulkActionsBar", () => {
  const user = userEvent.setup();

  it("confirms before deleting", async () => {
    const onDelete = vi.fn();
    render(
      <BulkActionsBar
        selectedCount={3}
        dismissableCount={2}
        onDismiss={vi.fn()}
        onDelete={onDelete}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Delete 3 jobs?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("explains skipped manual jobs when dismissing", async () => {
    const onDismiss = vi.fn();
    render(
      <BulkActionsBar
        selectedCount={3}
        dismissableCount={2}
        onDismiss={onDismiss}
        onDelete={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.getByText("Dismiss 2 jobs?")).toBeInTheDocument();
    expect(screen.getByText(/1 job you added yourself/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("disables Dismiss when nothing selected came from an automation", () => {
    render(
      <BulkActionsBar
        selectedCount={2}
        dismissableCount={0}
        onDismiss={vi.fn()}
        onDelete={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeDisabled();
  });
});
