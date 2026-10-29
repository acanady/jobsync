"use client";

import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APP_CONSTANTS } from "@/lib/constants";
import { EntityStringChipInput } from "./ats-search-step/EntityStringChipInput";
import { TargetingFields } from "./ats-search-step/TargetingFields";
import { RunOptionsFields } from "./ats-search-step/RunOptionsFields";
import type { SearchConfigValue } from "./ats-search-step/types";

// "Last day" is 26h, not 24: a daily run then never misses a posting that
// went up just before the previous run.
export const POSTED_WITHIN_OPTIONS = [
  { hours: APP_CONSTANTS.JOBSPY_DEFAULT_HOURS_OLD, label: "Last day" },
  { hours: 72, label: "Last 3 days" },
  { hours: 168, label: "Last week" },
  { hours: 720, label: "Last 30 days" },
];

export function postedWithinLabel(hours?: number): string {
  const h = hours ?? APP_CONSTANTS.JOBSPY_DEFAULT_HOURS_OLD;
  return (
    POSTED_WITHIN_OPTIONS.find((o) => o.hours === h)?.label ?? `Last ${h} hours`
  );
}

interface JobSpySearchStepProps {
  value: SearchConfigValue;
  onChange: (next: SearchConfigValue) => void;
}

export function JobSpySearchStep({ value, onChange }: JobSpySearchStepProps) {
  const hoursOld = value.hoursOld ?? APP_CONSTANTS.JOBSPY_DEFAULT_HOURS_OLD;
  const resultsPerTerm =
    value.resultsPerTerm ?? APP_CONSTANTS.JOBSPY_DEFAULT_RESULTS_PER_TERM;
  const searchTerms = value.searchTerms ?? [];
  const searchesFrom = searchTerms.length
    ? searchTerms
    : (value.targetTitles ?? []);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Searches Indeed through the JobSpy service, one search per term, then
          filters, ranks and matches the results like a company board. Excluded
          titles are applied here to job titles, not sent to Indeed.
        </span>
      </div>

      <EntityStringChipInput
        label="Search terms"
        placeholder="e.g., Software Engineer"
        noun="search term"
        description={`Optional. What to search Indeed for, up to ${APP_CONSTANTS.JOBSPY_MAX_SEARCH_TERMS}. Leave empty to search each target title below.`}
        values={searchTerms}
        onChange={(next) => onChange({ ...value, searchTerms: next })}
        // Free-form, like excluded titles: nothing to look up or persist.
        loadOptions={async () => []}
        createOption={async (lbl) => ({
          id: lbl,
          label: lbl,
          value: lbl.toLowerCase(),
        })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="jobspy-location">Search location</Label>
          <Input
            id="jobspy-location"
            placeholder={APP_CONSTANTS.JOBSPY_DEFAULT_LOCATION}
            value={value.location ?? ""}
            maxLength={100}
            onChange={(e) => onChange({ ...value, location: e.target.value })}
          />
          <p className="text-sm text-muted-foreground">
            Where Indeed searches. Defaults to{" "}
            {APP_CONSTANTS.JOBSPY_DEFAULT_LOCATION}.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Posted within</Label>
          <Select
            value={String(hoursOld)}
            onValueChange={(v) => onChange({ ...value, hoursOld: Number(v) })}
          >
            <SelectTrigger aria-label="Posted within">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSTED_WITHIN_OPTIONS.map((o) => (
                <SelectItem key={o.hours} value={String(o.hours)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            A daily automation only needs the last day.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Results per search: {resultsPerTerm}</Label>
        <Slider
          min={10}
          max={200}
          step={10}
          value={[resultsPerTerm]}
          onValueChange={(next) =>
            onChange({ ...value, resultsPerTerm: next[0] })
          }
        />
        <p className="text-sm text-muted-foreground">
          The most listings each search pulls from Indeed before filtering.
        </p>
      </div>

      <TargetingFields value={value} onChange={onChange} />

      {value.remoteUsOnly && (
        <p className="text-sm text-muted-foreground -mt-2">
          With Remote (US) only on, Indeed is also asked for remote jobs only.
        </p>
      )}

      {searchesFrom.length > APP_CONSTANTS.JOBSPY_MAX_SEARCH_TERMS && (
        <p className="text-sm text-destructive">
          At most {APP_CONSTANTS.JOBSPY_MAX_SEARCH_TERMS} searches per
          automation — add fewer{" "}
          {searchTerms.length ? "search terms" : "target titles"}.
        </p>
      )}

      <RunOptionsFields value={value} onChange={onChange} />
    </div>
  );
}
