import { isRemoteUsJob } from "@/lib/scraper/ats/remoteUs";

const gh = (location: string) => isRemoteUsJob({ location });

describe("isRemoteUsJob", () => {
  it.each([
    "Remote - USA",
    "United States - Remote",
    "Remote, United States",
    "U.S. (Remote)",
    "US-Remote",
    "Remote",
    "Distributed",
    "Home based - Worldwide",
    "Home Based - Americas",
    "Remote - California",
    "Remote, Canada; Remote, United States",
    "San Francisco, CA, US; Remote, US",
  ])("keeps Greenhouse location %j", (location) => {
    expect(gh(location)).toBe(true);
  });

  it.each([
    "Remote - Canada",
    "Canada - Remote (ON, AB, BC, or NS Only)",
    "Remote - India",
    "Home based - EMEA",
    "Remote International",
    "Brazil, Remote",
    "Latin America (Remote)",
    "New York, NY",
    "San Francisco, CA, US",
  ])("drops Greenhouse location %j", (location) => {
    expect(gh(location)).toBe(false);
  });

  it("uses Lever's country code over the location text", () => {
    expect(
      isRemoteUsJob({
        location: "Massachusetts - Boston",
        workplaceType: "REMOTE",
        country: "US",
      }),
    ).toBe(true);
    expect(
      isRemoteUsJob({ location: "Toronto", workplaceType: "REMOTE", country: "CA" }),
    ).toBe(false);
    expect(
      isRemoteUsJob({ location: "New York, NY", workplaceType: "HYBRID", country: "US" }),
    ).toBe(false);
  });

  it("treats workplaceType REMOTE as remote when there is no country", () => {
    expect(isRemoteUsJob({ location: "New York, NY", workplaceType: "REMOTE" })).toBe(true);
    expect(isRemoteUsJob({ location: "London, UK", workplaceType: "REMOTE" })).toBe(false);
  });
});
