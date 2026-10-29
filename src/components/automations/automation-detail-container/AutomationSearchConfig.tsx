"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  AutomationBoard,
  JobSpySourceConfig,
  LeverSourceConfig,
} from "@/models/automation.model";
import { companyBoardUrl } from "@/lib/atsBoardUrl";
import { APP_CONSTANTS } from "@/lib/constants";
import { postedWithinLabel } from "../JobSpySearchStep";

// Pure JSON parse (no runner dependency — this is a client component, and
// runner.ts pulls the network-calling scraper into the client bundle). The raw
// parse may be missing any field, so it's a Partial of the config shape.
function parseAtsConfig(
  sourceConfig: string | null | undefined,
  jobBoard: AutomationBoard,
): Partial<LeverSourceConfig & JobSpySourceConfig> | null {
  if (!sourceConfig) return null;
  try {
    return JSON.parse(sourceConfig)?.[jobBoard] ?? null;
  } catch {
    return null;
  }
}

interface AutomationSearchConfigProps {
  sourceConfig: string | null | undefined;
  jobBoard: AutomationBoard;
  retired: boolean;
}

export function AutomationSearchConfig({
  sourceConfig,
  jobBoard,
  retired,
}: AutomationSearchConfigProps) {
  const [showSearchConfig, setShowSearchConfig] = useState(false);

  const greenhouseConfig = retired
    ? null
    : parseAtsConfig(sourceConfig, jobBoard);

  if (!greenhouseConfig) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-4 -ml-2 text-muted-foreground"
        onClick={() => setShowSearchConfig((prev) => !prev)}
      >
        {showSearchConfig ? (
          <ChevronUp className="h-4 w-4 mr-1" />
        ) : (
          <ChevronDown className="h-4 w-4 mr-1" />
        )}
        {showSearchConfig ? "Show less" : "Show more"}
      </Button>

      {showSearchConfig && (
        <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
          {jobBoard === "jobspy" ? (
            <JobSpySearchDetails config={greenhouseConfig} />
          ) : (
            <div className="col-span-2 md:col-span-4">
              <p className="text-sm text-muted-foreground">Companies</p>
              {greenhouseConfig.companies?.length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {greenhouseConfig.companies.map((c) => (
                    <Badge key={c.token} variant="secondary" className="gap-1">
                      {c.name}
                      <a
                        href={companyBoardUrl(jobBoard, c)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${c.name} job board`}
                        title="Open job board"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="font-medium">-</p>
              )}
            </div>
          )}
          <div>
            <p className="text-sm text-muted-foreground">Target titles</p>
            <p className="font-medium">
              {greenhouseConfig.targetTitles?.length
                ? greenhouseConfig.targetTitles.join(", ")
                : "Any"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Keywords</p>
            <p className="font-medium">
              {greenhouseConfig.keywords?.length
                ? greenhouseConfig.keywords.join(", ")
                : "None"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Excluded titles</p>
            <p className="font-medium">
              {greenhouseConfig.excludeTitles?.length
                ? greenhouseConfig.excludeTitles.join(", ")
                : "None"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Locations</p>
            <p className="font-medium">
              {greenhouseConfig.locations?.length
                ? `${greenhouseConfig.locations.join(", ")}${
                    greenhouseConfig.strictLocation ? " (strict)" : ""
                  }`
                : "Any location"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Remote (US) only</p>
            <p className="font-medium">
              {greenhouseConfig.remoteUsOnly ? "Yes" : "No"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              Jobs analyzed per run
            </p>
            <p className="font-medium">
              {greenhouseConfig.topK ?? APP_CONSTANTS.MAX_JOBS_PER_RUN}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Extra listings</p>
            <p className="font-medium">
              {greenhouseConfig.saveUnanalyzed !== false
                ? "Saved"
                : "Not saved"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function JobSpySearchDetails({
  config,
}: {
  config: Partial<JobSpySourceConfig>;
}) {
  const searches = config.searchTerms?.length
    ? config.searchTerms
    : (config.targetTitles ?? []);
  return (
    <>
      <div className="col-span-2 md:col-span-4">
        <p className="text-sm text-muted-foreground">
          Indeed searches
          {!config.searchTerms?.length &&
            searches.length > 0 &&
            " (from target titles)"}
        </p>
        {searches.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {searches.map((term) => (
              <Badge key={term} variant="secondary">
                {term}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="font-medium">-</p>
        )}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Search location</p>
        <p className="font-medium">
          {config.location?.trim() || APP_CONSTANTS.JOBSPY_DEFAULT_LOCATION}
        </p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Posted within</p>
        <p className="font-medium">{postedWithinLabel(config.hoursOld)}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Results per search</p>
        <p className="font-medium">
          {config.resultsPerTerm ??
            APP_CONSTANTS.JOBSPY_DEFAULT_RESULTS_PER_TERM}
        </p>
      </div>
    </>
  );
}
