import { APP_CONSTANTS } from "@/lib/constants";
import type { AutomationBoard } from "@/models/automation.model";
import type { JobSpySearch } from "../jobspy/types";

export interface AtsRunConfig {
  companies: { name: string; token: string; host?: "default" | "eu" }[];
  // Set for a search board (jobspy) instead of companies.
  search?: JobSpySearch;
  targetTitles: string[];
  keywords: string[];
  excludeTitles: string[];
  locations: string[];
  strictLocation: boolean;
  remoteUsOnly: boolean;
  topK: number;
  saveUnanalyzed: boolean;
}

export function parseAtsConfig(
  sourceConfig: string | null | undefined,
  jobBoard: AutomationBoard,
): AtsRunConfig | null {
  if (!sourceConfig) return null;
  try {
    const parsed = JSON.parse(sourceConfig);
    const cfg = parsed?.[jobBoard];
    if (!cfg) return null;
    const search = jobBoard === "jobspy" ? parseJobSpySearch(cfg) : undefined;
    if (!search && !Array.isArray(cfg.companies)) return null;
    return {
      companies: search ? [] : cfg.companies,
      search,
      targetTitles: Array.isArray(cfg.targetTitles) ? cfg.targetTitles : [],
      keywords: Array.isArray(cfg.keywords) ? cfg.keywords : [],
      excludeTitles: Array.isArray(cfg.excludeTitles) ? cfg.excludeTitles : [],
      locations: Array.isArray(cfg.locations) ? cfg.locations : [],
      strictLocation: !!cfg.strictLocation,
      remoteUsOnly: !!cfg.remoteUsOnly,
      topK:
        typeof cfg.topK === "number" && cfg.topK > 0
          ? cfg.topK
          : APP_CONSTANTS.MAX_JOBS_PER_RUN,
      saveUnanalyzed: cfg.saveUnanalyzed !== false,
    };
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
    : [];
}

// Search terms default to the target titles: the spike found one Indeed
// search per title finds more, and more on-target, jobs than one OR'd query.
// Exclusions are never sent — Indeed matches "-word" against descriptions.
function parseJobSpySearch(cfg: Record<string, unknown>): JobSpySearch {
  const terms = stringList(cfg.searchTerms);
  const searchTerms = (terms.length ? terms : stringList(cfg.targetTitles)).slice(
    0,
    APP_CONSTANTS.JOBSPY_MAX_SEARCH_TERMS,
  );
  const int = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fallback;
  return {
    searchTerms,
    sites: ["indeed"],
    location:
      typeof cfg.location === "string" && cfg.location.trim()
        ? cfg.location.trim()
        : APP_CONSTANTS.JOBSPY_DEFAULT_LOCATION,
    // Indeed's remote filter follows the automation's remote-US switch; the
    // pipeline's remote-US gate still checks the country afterwards.
    isRemote: !!cfg.remoteUsOnly,
    hoursOld: int(cfg.hoursOld, APP_CONSTANTS.JOBSPY_DEFAULT_HOURS_OLD),
    resultsPerTerm: int(cfg.resultsPerTerm, APP_CONSTANTS.JOBSPY_DEFAULT_RESULTS_PER_TERM),
  };
}
