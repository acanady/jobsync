import type { JobDetails } from "../types";

// "Remote (US) only" gate. A job passes when it is remote AND workable from
// the US. Signals, strongest first:
//   1. country (Lever's ISO code) — authoritative when present.
//   2. workplaceType REMOTE (Lever/Ashby) — remote-ness for the whole posting.
//   3. location text (all Greenhouse has), checked per office segment, e.g.
//      "San Francisco, CA, US; Remote, US" passes on its second segment.
// A remote segment naming no place at all ("Remote", "Distributed") passes:
// on these boards a bare "Remote" overwhelmingly means US. One that names only
// non-US places ("Remote - India", "Canada (Remote)") does not.

const REMOTE_RE =
  /(^|[^a-z])(remote|home[\s-]?based|distributed|anywhere|work from home|wfh)([^a-z]|$)/i;

const US_RE =
  /(^|[^a-z])(us|u\.s\.?|usa|u\.s\.a\.?|united states(?: of america)?)([^a-z]|$)/i;

// Regions that include the US, so a US-based remote worker qualifies.
const GLOBAL_RE =
  /(^|[^a-z])(worldwide|global|anywhere|americas|north america)([^a-z]|$)/i;

// Places that rule a segment out when it names no US/global place alongside.
// Two-letter codes are omitted ("CA" is usually California, "IN" Indiana).
const NON_US_RE = new RegExp(
  "(^|[^a-z])(" +
    [
      "canada", "mexico", "brazil", "argentina", "colombia", "chile", "peru",
      "uruguay", "costa rica", "latin america", "latam", "south america",
      "uk", "u\\.k\\.", "united kingdom", "england", "scotland", "wales",
      "ireland", "germany", "france", "spain", "portugal", "italy",
      "netherlands", "belgium", "switzerland", "austria", "sweden", "norway",
      "denmark", "finland", "poland", "czech", "czechia", "hungary", "romania",
      "bulgaria", "greece", "serbia", "croatia", "ukraine", "estonia",
      "latvia", "lithuania", "turkey", "türkiye", "israel", "uae", "dubai",
      "saudi arabia", "egypt", "nigeria", "kenya", "south africa", "india",
      "pakistan", "bangladesh", "sri lanka", "philippines", "vietnam",
      "thailand", "malaysia", "indonesia", "singapore", "japan", "korea",
      "china", "hong kong", "taiwan", "australia", "new zealand", "emea",
      "apac", "europe", "asia", "africa", "middle east", "international",
      "london", "toronto", "vancouver", "montreal", "berlin", "paris",
      "amsterdam", "dublin", "madrid", "barcelona", "lisbon", "warsaw",
      "bangalore", "bengaluru", "hyderabad", "tokyo", "sydney",
    ].join("|") +
    ")([^a-z]|$)",
  "i",
);

function usCompatible(text: string): boolean {
  if (US_RE.test(text) || GLOBAL_RE.test(text)) return true;
  return !NON_US_RE.test(text);
}

export function isRemoteUsJob(
  job: Pick<JobDetails, "location" | "workplaceType" | "country">,
): boolean {
  const location = job.location || "";
  const remotePosting = job.workplaceType === "REMOTE";

  if (job.country) {
    return (
      job.country.toUpperCase() === "US" &&
      (remotePosting || REMOTE_RE.test(location))
    );
  }

  if (remotePosting) return usCompatible(location);

  return location
    .split(/[;|]/)
    .some((segment) => REMOTE_RE.test(segment) && usCompatible(segment));
}
