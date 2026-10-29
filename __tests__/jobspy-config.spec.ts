import { parseAtsConfig } from "@/lib/scraper/automation-run/config";

const parse = (cfg: Record<string, unknown>) =>
  parseAtsConfig(JSON.stringify({ jobspy: cfg }), "jobspy");

describe("parseAtsConfig: jobspy", () => {
  it("applies the spike's defaults and needs no companies", () => {
    const config = parse({ searchTerms: ["Software Engineer"] });
    expect(config).not.toBeNull();
    expect(config!.companies).toEqual([]);
    expect(config!.search).toEqual({
      searchTerms: ["Software Engineer"],
      sites: ["indeed"],
      location: "United States",
      isRemote: false,
      hoursOld: 26,
      resultsPerTerm: 100,
    });
  });

  it("searches the target titles when no search terms are set", () => {
    const config = parse({ targetTitles: ["Software Engineer", " AI Engineer "], searchTerms: [] });
    expect(config!.search!.searchTerms).toEqual(["Software Engineer", "AI Engineer"]);
    expect(config!.targetTitles).toEqual(["Software Engineer", " AI Engineer "]);
  });

  it("prefers explicit search terms over target titles", () => {
    const config = parse({ targetTitles: ["Software Engineer"], searchTerms: ["Forward Deployed Engineer"] });
    expect(config!.search!.searchTerms).toEqual(["Forward Deployed Engineer"]);
  });

  it("asks Indeed for remote jobs only when remote (US) only is on", () => {
    expect(parse({ searchTerms: ["x"], remoteUsOnly: true })!.search!.isRemote).toBe(true);
    expect(parse({ searchTerms: ["x"], remoteUsOnly: false })!.search!.isRemote).toBe(false);
  });

  it("never sends title exclusions to the search", () => {
    const config = parse({ searchTerms: ["Software Engineer"], excludeTitles: ["Senior"] });
    expect(config!.excludeTitles).toEqual(["Senior"]);
    expect(JSON.stringify(config!.search)).not.toContain("Senior");
  });

  it("keeps the pipeline's targeting fields", () => {
    const config = parse({
      searchTerms: ["x"], keywords: ["Python"], locations: ["Remote"], strictLocation: true, topK: 5,
    });
    expect(config).toMatchObject({ keywords: ["Python"], locations: ["Remote"], strictLocation: true, topK: 5 });
  });

  it("uses saved location, recency and result count, ignoring junk", () => {
    expect(parse({ searchTerms: ["x"], location: "Huntsville, AL", hoursOld: 48, resultsPerTerm: 30 })!.search)
      .toMatchObject({ location: "Huntsville, AL", hoursOld: 48, resultsPerTerm: 30 });
    expect(parse({ searchTerms: ["x"], location: "  ", hoursOld: -1, resultsPerTerm: "lots" })!.search)
      .toMatchObject({ location: "United States", hoursOld: 26, resultsPerTerm: 100 });
    expect(parse({ searchTerms: ["x"], hoursOld: 0, resultsPerTerm: 0.5 })!.search)
      .toMatchObject({ hoursOld: 26, resultsPerTerm: 100 });
  });

  it("caps the search at 20 terms and drops blank ones", () => {
    const terms = ["", "  ", ...Array.from({ length: 25 }, (_, i) => `T${i}`)];
    expect(parse({ searchTerms: terms })!.search!.searchTerms).toHaveLength(20);
    expect(parse({ searchTerms: terms })!.search!.searchTerms[0]).toBe("T0");
  });

  it("returns an empty search (not null) when there is nothing to search", () => {
    expect(parse({ keywords: ["x"] })!.search!.searchTerms).toEqual([]);
  });

  it("does not give company boards a search", () => {
    const config = parseAtsConfig(JSON.stringify({ lever: { companies: [] } }), "lever");
    expect(config!.search).toBeUndefined();
    expect(parseAtsConfig(JSON.stringify({ lever: { targetTitles: ["x"] } }), "lever")).toBeNull();
  });
});
