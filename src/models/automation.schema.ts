import { z } from "zod";
import { APP_CONSTANTS } from "@/lib/constants";
// Deep-import (NOT the barrel) — utils.ts is pure; the barrel pulls scraper
// network code into the client bundle via this file's client consumers.
import { ATS_TOKEN_REGEX } from "@/lib/scraper/utils";

export const JobBoardSchema = z.enum(["greenhouse", "lever", "ashby"]);
export const AutomationBoardSchema = z.enum(["greenhouse", "lever", "ashby", "jobspy"]);

export const AutomationStatusSchema = z.enum(["active", "paused"]);

export const AutomationRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "completed_with_errors",
  "blocked",
  "rate_limited",
]);

export const DiscoveryStatusSchema = z.enum(["new", "accepted", "dismissed"]);

export const GreenhouseCompanySchema = z.object({
  name: z.string().min(1).max(200),
  token: z.string().min(1).max(80),
});

export const GreenhouseSourceConfigSchema = z.object({
  companies: z
    .array(GreenhouseCompanySchema)
    .max(APP_CONSTANTS.ATS_MAX_COMPANIES),
  targetTitles: z.array(z.string().min(1).max(100)).optional(),
  keywords: z.array(z.string().min(1).max(100)).optional(),
  excludeTitles: z.array(z.string().min(1).max(100)).optional(),
  locations: z.array(z.string().min(1).max(100)).optional(),
  strictLocation: z.boolean().optional(),
  remoteUsOnly: z.boolean().optional(),
  topK: z.number().int().min(1).max(APP_CONSTANTS.ATS_LISTING_CAP).optional(),
  saveUnanalyzed: z.boolean().optional(),
});

// Override `token` with the allowlist regex so a directly-POSTed Lever config
// can't smuggle a malformed token past the save boundary.
export const LeverCompanySchema = GreenhouseCompanySchema.extend({
  token: z.string().regex(ATS_TOKEN_REGEX),
  host: z.enum(["default", "eu"]).optional(),
});

// Same fields/MAX/cap as Greenhouse, `companies` swapped to LeverCompanySchema.
export const LeverSourceConfigSchema = GreenhouseSourceConfigSchema.extend({
  companies: z
    .array(LeverCompanySchema)
    .max(APP_CONSTANTS.ATS_MAX_COMPANIES),
});

// Same token allowlist as Lever (rejects path/query injection at the save
// boundary); no `host` — Ashby is single-host.
export const AshbyCompanySchema = GreenhouseCompanySchema.extend({
  token: z.string().regex(ATS_TOKEN_REGEX),
});

export const AshbySourceConfigSchema = GreenhouseSourceConfigSchema.extend({
  companies: z
    .array(AshbyCompanySchema)
    .max(APP_CONSTANTS.ATS_MAX_COMPANIES),
});

// Bounds match jobspy-service's ScrapeRequest, so a saved config is always
// one the service accepts.
export const JobSpySourceConfigSchema = GreenhouseSourceConfigSchema.omit({
  companies: true,
}).extend({
  searchTerms: z.array(z.string().trim().min(1).max(100)).max(APP_CONSTANTS.JOBSPY_MAX_SEARCH_TERMS).optional(),
  sites: z.array(z.enum(["indeed"])).min(1).optional(),
  location: z.string().trim().max(100).optional(),
  hoursOld: z.number().int().min(1).max(720).optional(),
  resultsPerTerm: z.number().int().min(1).max(200).optional(),
});

export const SourceConfigSchema = z.object({
  greenhouse: GreenhouseSourceConfigSchema.optional(),
  lever: LeverSourceConfigSchema.optional(),
  ashby: AshbySourceConfigSchema.optional(),
  jobspy: JobSpySourceConfigSchema.optional(),
});

type BoardConfigCheck = {
  jobBoard?: z.infer<typeof AutomationBoardSchema>;
  sourceConfig?: z.infer<typeof SourceConfigSchema>;
};

// A company board needs companies; a search board needs something to search
// for — its search terms, or else its target titles.
function requireBoardTargets(data: BoardConfigCheck, ctx: z.RefinementCtx) {
  if (!data.jobBoard) return;
  if (data.jobBoard === "jobspy") {
    const cfg = data.sourceConfig?.jobspy;
    const terms = cfg?.searchTerms?.length ? cfg.searchTerms : (cfg?.targetTitles ?? []);
    if (terms.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceConfig", "jobspy", "searchTerms"],
        message: "Add at least one search term or target title",
      });
    }
    if (terms.length > APP_CONSTANTS.JOBSPY_MAX_SEARCH_TERMS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceConfig", "jobspy", "searchTerms"],
        message: `At most ${APP_CONSTANTS.JOBSPY_MAX_SEARCH_TERMS} searches per automation`,
      });
    }
    return;
  }
  const companies = data.sourceConfig?.[data.jobBoard]?.companies ?? [];
  if (companies.length < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sourceConfig", data.jobBoard, "companies"],
      message: "Select at least one company",
    });
  }
}

export const CreateAutomationSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    jobBoard: AutomationBoardSchema,
    keywords: z.string().max(200).optional(),
    location: z.string().max(100).optional(),
    sourceConfig: SourceConfigSchema.optional(),
    resumeId: z.string().uuid("Invalid resume"),
    matchThreshold: z.number().min(0).max(100),
    scheduleHour: z.number().min(0).max(23),
  })
  .superRefine(requireBoardTargets);

export const UpdateAutomationSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    jobBoard: AutomationBoardSchema.optional(),
    keywords: z.string().max(200).optional(),
    location: z.string().max(100).optional(),
    sourceConfig: SourceConfigSchema.optional(),
    resumeId: z.string().uuid("Invalid resume").optional(),
    matchThreshold: z.number().min(0).max(100).optional(),
    scheduleHour: z.number().min(0).max(23).optional(),
  })
  .superRefine(requireBoardTargets);

export type CreateAutomationInput = z.infer<typeof CreateAutomationSchema>;
export type UpdateAutomationInput = z.infer<typeof UpdateAutomationSchema>;
export type SourceConfigInput = z.infer<typeof SourceConfigSchema>;
export type GreenhouseSourceConfigInput = z.infer<
  typeof GreenhouseSourceConfigSchema
>;
