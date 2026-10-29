import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderHook, act } from "@testing-library/react";
import { JobSpySearchStep, postedWithinLabel } from "@/components/automations/JobSpySearchStep";
import { StepReview } from "@/components/automations/automation-wizard/StepReview";
import { AutomationSearchConfig } from "@/components/automations/automation-detail-container/AutomationSearchConfig";
import { useWizardForm } from "@/components/automations/automation-wizard/useWizardForm";
import { EMPTY_ATS, EMPTY_SEARCH } from "@/components/automations/automation-wizard/wizardConfig";
import { automationBoardLabel } from "@/models/automation.model";

vi.mock("@/actions/jobtitle.actions", () => ({ getAllJobTitles: vi.fn().mockResolvedValue([]), createJobTitle: vi.fn() }));
vi.mock("@/actions/tag.actions", () => ({ getAllTags: vi.fn().mockResolvedValue([]), createTag: vi.fn() }));
vi.mock("@/actions/jobLocation.actions", () => ({ getAllJobLocations: vi.fn().mockResolvedValue([]) }));
vi.mock("@/actions/job.actions", () => ({ createLocation: vi.fn() }));
vi.mock("@/actions/automation.actions", () => ({ createAutomation: vi.fn(), updateAutomation: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toastInfo: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }));

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();

const titles = (n: number) => Array.from({ length: n }, (_, i) => `Title ${i}`);

describe("JobSpySearchStep", () => {
  it("edits the search location", () => {
    const onChange = vi.fn();
    render(<JobSpySearchStep value={EMPTY_SEARCH} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Search location"), { target: { value: "Huntsville, AL" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ location: "Huntsville, AL" }));
  });

  it("changes how recent postings must be", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<JobSpySearchStep value={EMPTY_SEARCH} onChange={onChange} />);
    await user.click(screen.getByRole("combobox", { name: "Posted within" }));
    await user.click(await screen.findByRole("option", { name: "Last week" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hoursOld: 168 }));
  });

  it("shows the shared targeting fields and keeps edits to them in the search config", () => {
    const onChange = vi.fn();
    render(<JobSpySearchStep value={{ ...EMPTY_SEARCH, searchTerms: ["AI Engineer"] }} onChange={onChange} />);
    expect(screen.getByText("Exclude titles containing")).toBeInTheDocument();
    // The shared switch's label isn't linked to it; find it in its row.
    const row = screen.getByText("Remote (US) only").closest("div.rounded-lg")!;
    fireEvent.click(row.querySelector('[role="switch"]')!);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ remoteUsOnly: true, searchTerms: ["AI Engineer"] }),
    );
  });

  it("notes that Remote (US) only also filters the Indeed search", () => {
    const { rerender } = render(<JobSpySearchStep value={EMPTY_SEARCH} onChange={vi.fn()} />);
    expect(screen.queryByText(/Indeed is also asked for remote jobs/)).toBeNull();
    rerender(<JobSpySearchStep value={{ ...EMPTY_SEARCH, remoteUsOnly: true }} onChange={vi.fn()} />);
    expect(screen.getByText(/Indeed is also asked for remote jobs/)).toBeInTheDocument();
  });

  it("warns past 20 searches, counting target titles when there are no search terms", () => {
    const { rerender } = render(
      <JobSpySearchStep value={{ ...EMPTY_SEARCH, targetTitles: titles(20) }} onChange={vi.fn()} />,
    );
    expect(screen.queryByText(/At most 20 searches/)).toBeNull();
    rerender(<JobSpySearchStep value={{ ...EMPTY_SEARCH, targetTitles: titles(21) }} onChange={vi.fn()} />);
    expect(screen.getByText(/At most 20 searches/)).toHaveTextContent("target titles");
  });
});

describe("postedWithinLabel", () => {
  it("names the presets and falls back to hours", () => {
    expect(postedWithinLabel(undefined)).toBe("Last day");
    expect(postedWithinLabel(72)).toBe("Last 3 days");
    expect(postedWithinLabel(48)).toBe("Last 48 hours");
  });
});

describe("StepReview", () => {
  const formValues = { name: "Indeed", jobBoard: "jobspy", matchThreshold: 80, scheduleHour: 7 } as any;

  it("lists a JobSpy automation's searches and search settings instead of companies", () => {
    render(
      <StepReview
        formValues={formValues}
        atsConfig={EMPTY_ATS}
        searchConfig={{ ...EMPTY_SEARCH, location: "", targetTitles: ["Software Engineer", "AI Engineer"], excludeTitles: ["Senior"] }}
      />,
    );
    expect(screen.getByText("Indeed (JobSpy)")).toBeInTheDocument();
    expect(screen.getByText("Searches").nextSibling).toHaveTextContent("Software Engineer, AI Engineer");
    expect(screen.getByText("Search location").nextSibling).toHaveTextContent("United States");
    expect(screen.getByText("Posted within").nextSibling).toHaveTextContent("Last day");
    expect(screen.getByText("Excluded titles").nextSibling).toHaveTextContent("Senior");
    expect(screen.queryByText("Companies")).toBeNull();
  });

  it("still lists companies for a company board", () => {
    render(
      <StepReview
        formValues={{ ...formValues, jobBoard: "lever" }}
        atsConfig={{ ...EMPTY_ATS, companies: [{ name: "Shield AI", token: "shieldai" }] }}
        searchConfig={EMPTY_SEARCH}
      />,
    );
    expect(screen.getByText("Lever")).toBeInTheDocument();
    expect(screen.getByText("Companies").nextSibling).toHaveTextContent("Shield AI");
    expect(screen.queryByText("Searches")).toBeNull();
  });
});

describe("AutomationSearchConfig (detail page)", () => {
  it("shows a JobSpy automation's searches and settings", () => {
    render(
      <AutomationSearchConfig
        sourceConfig={JSON.stringify({ jobspy: { targetTitles: ["Software Engineer"], hoursOld: 72, resultsPerTerm: 50 } })}
        jobBoard="jobspy"
        retired={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /show more/i }));
    expect(screen.getByText(/Indeed searches/)).toHaveTextContent("(from target titles)");
    expect(screen.getAllByText("Software Engineer").length).toBeGreaterThan(0);
    expect(screen.getByText("Search location").nextSibling).toHaveTextContent("United States");
    expect(screen.getByText("Posted within").nextSibling).toHaveTextContent("Last 3 days");
    expect(screen.getByText("Results per search").nextSibling).toHaveTextContent("50");
    expect(screen.queryByText("Companies")).toBeNull();
  });
});

describe("useWizardForm: the Search step's Next button", () => {
  const setup = () =>
    renderHook(() =>
      useWizardForm({ open: true, onOpenChange: vi.fn(), automations: [], onSuccess: vi.fn() }),
    );
  const toSearchStep = (r: ReturnType<typeof setup>["result"], board: string, sourceConfig: object) => {
    act(() => {
      r.current.form.setValue("name", "Indeed");
      r.current.form.setValue("jobBoard", board as any);
      r.current.form.setValue("sourceConfig", sourceConfig as any);
    });
    act(() => r.current.nextStep());
    expect(r.current.step).toBe(1);
  };

  it("needs a search term or target title for JobSpy, not companies", () => {
    const { result } = setup();
    toSearchStep(result, "jobspy", { jobspy: { ...EMPTY_SEARCH } });
    expect(result.current.canGoNext()).toBe(false);
    act(() => result.current.form.setValue("sourceConfig", { jobspy: { ...EMPTY_SEARCH, targetTitles: ["Software Engineer"] } }));
    expect(result.current.canGoNext()).toBe(true);
    expect(result.current.searchConfig.targetTitles).toEqual(["Software Engineer"]);
  });

  it("accepts search terms alone, without target titles", () => {
    const { result } = setup();
    toSearchStep(result, "jobspy", { jobspy: { ...EMPTY_SEARCH, searchTerms: ["Forward Deployed Engineer"] } });
    expect(result.current.canGoNext()).toBe(true);
  });

  it("blocks more than 20 searches, counting search terms over titles", () => {
    const { result } = setup();
    toSearchStep(result, "jobspy", {
      jobspy: { ...EMPTY_SEARCH, searchTerms: titles(21), targetTitles: ["Software Engineer"] },
    });
    expect(result.current.canGoNext()).toBe(false);
  });

  it("still needs companies for a company board", () => {
    const { result } = setup();
    toSearchStep(result, "greenhouse", { greenhouse: { ...EMPTY_ATS } });
    expect(result.current.canGoNext()).toBe(false);
    act(() => result.current.form.setValue("sourceConfig", { greenhouse: { ...EMPTY_ATS, companies: [{ name: "A", token: "a" }] } }));
    expect(result.current.canGoNext()).toBe(true);
  });
});

describe("automationBoardLabel", () => {
  it("names each board and shows a retired one as-is", () => {
    expect(automationBoardLabel("jobspy")).toBe("Indeed (JobSpy)");
    expect(automationBoardLabel("ashby")).toBe("Ashby");
    expect(automationBoardLabel("jsearch")).toBe("jsearch");
    expect(automationBoardLabel("constructor")).toBe("constructor");
  });
});
