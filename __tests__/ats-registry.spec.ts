import { boardLabel, runSourceFor } from "@/lib/scraper/ats/registry";

describe("runSourceFor", () => {
  it("returns company boards as boards and JobSpy as a search", () => {
    expect(runSourceFor("greenhouse")).toMatchObject({ kind: "boards", provider: { id: "greenhouse" } });
    expect(runSourceFor("lever")).toMatchObject({ kind: "boards", provider: { id: "lever" } });
    expect(runSourceFor("ashby")).toMatchObject({ kind: "boards", provider: { id: "ashby" } });
    expect(runSourceFor("jobspy")).toMatchObject({ kind: "search", provider: { id: "jobspy" } });
  });

  it("returns nothing for a retired or unknown board", () => {
    expect(runSourceFor("jsearch")).toBeUndefined();
    expect(runSourceFor("toString")).toBeUndefined();
  });
});

describe("boardLabel", () => {
  it("names every board, falling back to the raw value", () => {
    expect(boardLabel("greenhouse")).toBe("Greenhouse");
    expect(boardLabel("jobspy")).toBe("Indeed (JobSpy)");
    expect(boardLabel("jsearch")).toBe("jsearch");
  });
});
