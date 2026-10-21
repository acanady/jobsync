import { z } from "zod";
import { McpAddJobInputShape } from "@/models/mcp.schema";
import { ResumeEditsSchema } from "@/models/resumeEdits";

export const AgentChatRequestSchema = z.object({
  // Validated by the SDK downstream, not here. The whole array is
  // client-supplied; nothing in it widens what the request can touch,
  // because userId always comes from the session.
  messages: z.array(z.any()),
  pageContext: z
    .object({
      route: z.string().optional(),
      jobId: z.string().optional(),
      resumeId: z.string().optional(),
    })
    .optional(),
});

export type AgentChatRequest = z.infer<typeof AgentChatRequestSchema>;

// Derived from the MCP RAW shape, not McpAddJobSchema: AI SDK's tool()
// uses one schema for both the JSON schema the model reads and the
// validation of what it returns, so the date transforms are deferred to
// AgentAddJobParseSchema. status keeps its z.preprocess — that is what
// keeps enum: [...] on the input side of the emitted JSON schema.
export const AgentAddJobSchema = z
  .object(McpAddJobInputShape)
  .omit({ upsert: true, allowDuplicate: true })
  .extend({
    jobDescription: z
      .string()
      .refine((val) => val === "N/A" || val.length >= 10, "jobDescription must be at least 10 characters")
      .optional()
      .describe("What the job involves, in the user's own words, copied verbatim and never summarised. Always include this field, even if their description is only one sentence and looks nothing like a full posting, and never condense it into tags instead. If you were shown only the opening portion of a pasted posting, copy the portion you were shown. Use 'N/A' only if the user explicitly declines to give any description after being asked once."),
  });

export const AgentAddJobInputShape = AgentAddJobSchema.shape;

// Parsed inside execute, after the model's input has been validated.
export const AgentAddJobParseSchema = AgentAddJobSchema.extend({
  dueDate: z.string().datetime({ offset: true }).optional().transform((v) => (v ? new Date(v) : undefined)),
  appliedDate: z.string().datetime({ offset: true }).optional().transform((v) => (v ? new Date(v) : undefined)),
});

export type AgentAddJobInput = z.infer<typeof AgentAddJobParseSchema>;

// One optional field, and never an id: the model names a resume the way the
// user did, and the server resolves it ownership-scoped. An id-shaped input
// would be an IDOR surface the model could be talked into filling.
export const AgentGetResumeSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume to read, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume they are currently viewing, or their default resume."),
});

export type AgentGetResumeInput = z.infer<typeof AgentGetResumeSchema>;

// Same one-optional-field shape as AgentGetResumeSchema, and never an id: the
// model names a resume the way the user did, and the server resolves it
// ownership-scoped.
export const AgentReviewResumeSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume to review, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume they are currently viewing, or their default resume."),
});

export type AgentReviewResumeInput = z.infer<typeof AgentReviewResumeSchema>;

// No job field of any kind: match_job scores the job the user is viewing, and
// the id comes from server-held page context. An id-shaped input would be an
// IDOR surface the model could be talked into filling.
export const AgentMatchJobSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume to match against, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume linked to the job, or their default resume."),
});

export type AgentMatchJobInput = z.infer<typeof AgentMatchJobSchema>;

// No job field of any kind, for the same reason AgentMatchJobSchema has none:
// the letter is written for the job the user is viewing, and the id comes from
// server-held page context.
export const AgentCoverLetterSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume the letter should draw on, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume linked to the job, or their default resume."),
});

export type AgentCoverLetterInput = z.infer<typeof AgentCoverLetterSchema>;

// No job field: the resume is tailored to the job the user is viewing, from
// server-held page context. requests carries what the user asked for in their
// own words, so the tailoring generation can honour it.
export const AgentTailorResumeSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume to tailor, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume linked to the job, or their default resume."),
  requests: z.string().max(2000).optional().describe("Any specific changes or emphasis the user asked for, in their own words (e.g. 'focus on networking, drop the MATLAB bullets'). Omit if they only asked to tailor the resume."),
});

export type AgentTailorResumeInput = z.infer<typeof AgentTailorResumeSchema>;

// The edits are the model's, written from what the user dictated; the server
// fits them to the resume and the user approves them on a card before
// anything is written. Never an id, for the same reason as the tools above.
export const AgentUpdateResumeSchema = z.object({
  resumeTitle: z.string().optional().describe("The title of the resume to change, as the user referred to it. Omit this entirely if the user did not name one — the app then uses the resume they are currently viewing, or their default resume."),
  edits: ResumeEditsSchema.describe("Only the parts the user asked to change. Experience entries are named by company and job title exactly as they appear on the resume; call get_resume first if you have not read it this conversation."),
});

export type AgentUpdateResumeInput = z.infer<typeof AgentUpdateResumeSchema>;
