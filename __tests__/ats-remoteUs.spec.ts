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
    // Each office is judged on its own: the remote office here is Canadian
    // and the US office is on-site, so the job is not remote-US even though
    // the whole string mentions both "Remote" and "US".
    "Remote - Canada; New York, NY, US",
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
    // Cases where the text alone would decide the other way, so only the
    // country code gets them right.
    expect(isRemoteUsJob({ location: "Remote", workplaceType: "REMOTE", country: "BR" })).toBe(false);
    expect(
      isRemoteUsJob({ location: "Remote - Canada", workplaceType: "REMOTE", country: "US" }),
    ).toBe(true);
  });

  it("treats workplaceType REMOTE as remote when there is no country", () => {
    expect(isRemoteUsJob({ location: "New York, NY", workplaceType: "REMOTE" })).toBe(true);
    expect(isRemoteUsJob({ location: "London, UK", workplaceType: "REMOTE" })).toBe(false);
  });
});
