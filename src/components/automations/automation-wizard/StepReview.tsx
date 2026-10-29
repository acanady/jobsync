"use client";

import { APP_CONSTANTS } from "@/lib/constants";
import type { CreateAutomationInput } from "@/models/automation.schema";
import { automationBoardLabel } from "@/models/automation.model";
import type { AtsConfigValue } from "../AtsSearchStep";
import type { SearchConfigValue } from "../ats-search-step/types";
import { postedWithinLabel } from "../JobSpySearchStep";
import type { WizardResume } from "./wizardConfig";

export function StepReview({
  formValues,
  atsConfig: companyConfig,
  searchConfig,
  selectedResume,
}: {
  formValues: CreateAutomationInput;
  atsConfig: AtsConfigValue;
  searchConfig: SearchConfigValue;
  selectedResume?: WizardResume;
}) {
  const isSearch = formValues.jobBoard === "jobspy";
  // The targeting rows below read the same fields from either config.
  const atsConfig = isSearch ? searchConfig : companyConfig;
  const searches = searchConfig.searchTerms?.length
    ? searchConfig.searchTerms
    : (searchConfig.targetTitles ?? []);
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Name</span>
        <span className="font-medium">{formValues.name || "-"}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Job Board</span>
        <span className="font-medium">
          {formValues.jobBoard ? automationBoardLabel(formValues.jobBoard) : "-"}
        </span>
      </div>
      {isSearch ? (
        <>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Searches</span>
            <span className="font-medium text-right">
              {searches.length ? searches.join(", ") : "-"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Search location</span>
            <span className="font-medium text-right">
              {searchConfig.location?.trim() || APP_CONSTANTS.JOBSPY_DEFAULT_LOCATION}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Posted within</span>
            <span className="font-medium text-right">
              {postedWithinLabel(searchConfig.hoursOld)}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Results per search</span>
            <span className="font-medium text-right">
              {searchConfig.resultsPerTerm ?? APP_CONSTANTS.JOBSPY_DEFAULT_RESULTS_PER_TERM}
            </span>
          </div>
        </>
      ) : (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Companies</span>
          <span className="font-medium text-right">
            {companyConfig.companies?.length
              ? companyConfig.companies.map((c) => c.name).join(", ")
              : "-"}
          </span>
        </div>
      )}
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Target titles</span>
        <span className="font-medium text-right">
          {atsConfig.targetTitles?.length
            ? atsConfig.targetTitles.join(", ")
            : "Any"}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Excluded titles</span>
        <span className="font-medium text-right">
          {atsConfig.excludeTitles?.length
            ? atsConfig.excludeTitles.join(", ")
            : "None"}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Locations</span>
        <span className="font-medium text-right">
          {atsConfig.locations?.length
            ? `${atsConfig.locations.join(", ")}${
                atsConfig.strictLocation ? " (strict)" : ""
              }`
            : "Any location"}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Remote (US) only</span>
        <span className="font-medium text-right">
          {atsConfig.remoteUsOnly ? "Yes" : "No"}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Jobs analyzed per run</span>
        <span className="font-medium text-right">
          {atsConfig.topK ?? APP_CONSTANTS.MAX_JOBS_PER_RUN}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Save additional listings</span>
        <span className="font-medium text-right">
          {atsConfig.saveUnanalyzed !== false ? "Yes" : "No"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Resume</span>
        <span className="font-medium">
          {selectedResume?.title || "Not selected"}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Match Threshold</span>
        <span className="font-medium">{formValues.matchThreshold ?? 80}%</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Schedule</span>
        <span className="font-medium">
          Daily at{" "}
          {(formValues.scheduleHour ?? 8).toString().padStart(2, "0")}:00
        </span>
      </div>
    </div>
  );
}
