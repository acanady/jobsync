import type { JobSpySite } from "@/models/automation.model";

// One run's search, resolved from the automation's sourceConfig with
// defaults applied. Mirrors jobspy-service's ScrapeRequest.
export interface JobSpySearch {
  searchTerms: string[];
  sites: JobSpySite[];
  location: string;
  isRemote: boolean;
  hoursOld: number;
  resultsPerTerm: number;
}

// jobspy-service's response (jobspy-service/app/schemas.py).
export interface JobSpySalary {
  min: number | null;
  max: number | null;
  interval: string | null;
  currency: string | null;
}

export interface JobSpyJob {
  id: string;
  site: string;
  searchTerm: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  boardUrl: string;
  postedDate: string | null;
  salary: JobSpySalary | null;
  jobType: string | null;
  isRemote: boolean | null;
}

export interface JobSpyResponse {
  jobs: JobSpyJob[];
  errors: { site: string; searchTerm: string; reason: string }[];
}
