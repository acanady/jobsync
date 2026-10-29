import type {
  GreenhouseSourceConfig,
  JobSpySourceConfig,
  LeverSourceConfig,
} from "@/models/automation.model";

// The step is provider-agnostic; it edits the canonical Lever config shape — a
// superset of Greenhouse's, where the extra per-company `host` is unused and
// UI-invisible for Greenhouse.
export type AtsConfigValue = LeverSourceConfig;

// The targeting and run-option fields every board shares; TargetingFields
// and RunOptionsFields edit just these, so they serve company boards and the
// JobSpy search alike.
export type TargetingValue = Omit<GreenhouseSourceConfig, "companies">;

export type SearchConfigValue = JobSpySourceConfig;

export type EntityOption = { id: string; label: string; value: string };

export const PROVIDER_META: Record<
  string,
  { label: string; urlHint: string; searchExample: string }
> = {
  greenhouse: {
    label: "Greenhouse",
    urlHint: "Or paste a boards.greenhouse.io link",
    searchExample: "Anthropic",
  },
  lever: {
    label: "Lever",
    urlHint: "Or paste a jobs.lever.co link or token",
    searchExample: "Netflix",
  },
  ashby: {
    label: "Ashby",
    urlHint: "Or paste a jobs.ashbyhq.com link or token",
    searchExample: "Ramp",
  },
};
