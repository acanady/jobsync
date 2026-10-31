import { render, screen } from "@testing-library/react";
import { JobSummaryCard } from "@/components/myjobs/job-details/JobSummaryCard";

vi.mock("@/components/profile/DownloadFileButton", () => ({ DownloadFileButton: () => null }));

const job = (extra: Record<string, unknown> = {}) =>
  ({
    id: "job-1",
    jobType: "FT",
    salaryRange: "$120k–$160k/yr",
    JobSource: { label: "Indeed" },
    tags: [],
    ...extra,
  }) as any;
const status = { id: "s", label: "Draft", value: "draft" } as any;
const posted = { low: 140000, high: 155000, currency: "USD", period: "year", basis: "posted" };

const renderCard = (jobExtra: Record<string, unknown>, matchData: any) =>
  render(<JobSummaryCard job={job(jobExtra)} currentStatus={status} matchData={matchData} />);

describe("AI Suggested Salary on the job screen", () => {
  it("shows a target inside the posted range next to the posting's own range", () => {
    renderCard({ matchScore: 81 }, { matchScore: 81, recommendation: "strong match", body: "", suggestedSalary: posted, resumeTitle: "Main resume" });
    const section = screen.getByTestId("ai-suggested-salary");
    expect(section).toHaveTextContent("AI Suggested Salary");
    expect(section).toHaveTextContent("$140k–$155k/yr");
    expect(section).toHaveTextContent("Within posted range");
    expect(section).toHaveTextContent("Matched against Main resume.");
    expect(screen.getByText("$120k–$160k/yr")).toBeInTheDocument();
  });

  it("labels an estimate when the posting has no pay", () => {
    renderCard(
      { matchScore: 66, salaryRange: null },
      { matchScore: 66, body: "", suggestedSalary: { ...posted, low: 60, high: 75, period: "hour", basis: "estimated" } },
    );
    const section = screen.getByTestId("ai-suggested-salary");
    expect(section).toHaveTextContent("$60–$75/hr");
    expect(section).toHaveTextContent("Estimated");
    expect(section).toHaveTextContent(/not market data/);
  });

  it("explains a match made before suggestions existed", () => {
    renderCard({ matchScore: 70 }, { matchScore: 70, body: "" });
    expect(screen.getByTestId("ai-suggested-salary")).toHaveTextContent(/run the AI match again/);
  });

  it("ignores a malformed stored suggestion", () => {
    renderCard({ matchScore: 70 }, { matchScore: 70, body: "", suggestedSalary: { ...posted, low: "lots" } });
    expect(screen.getByTestId("ai-suggested-salary")).toHaveTextContent(/run the AI match again/);
  });

  it.each([
    ["no match", {}, null],
    ["a pre-rank-only automation score", { matchScore: 35 }, { matchScore: 35, body: "", analyzed: false, suggestedSalary: posted }],
  ])("is hidden with %s", (_, jobExtra, matchData) => {
    renderCard(jobExtra, matchData);
    expect(screen.queryByTestId("ai-suggested-salary")).toBeNull();
  });
});
