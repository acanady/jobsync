"use client";

import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgentChat } from "@/components/agent/AgentChatProvider";

// Remembered per match card so a reopened conversation does not ask again.
// Browser-local and best-effort: storage may be blocked.
function storageKey(id: string) {
  return `jobsync.tailorOffer.${id}`;
}

/**
 * Shown under a successful match: match_job ends the turn, so the follow-up
 * question lives on the card rather than in a model reply. "Yes" sends an
 * ordinary chat message naming the resume that was just matched, which the
 * model answers with tailor_resume.
 */
export function TailorOffer({
  matchId,
  resumeTitle,
}: {
  matchId: string;
  resumeTitle: string;
}) {
  const { sendMessage } = useAgentChat();
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey(matchId));
      if (saved === "yes" || saved === "no") setAnswered(saved);
    } catch {
      // Storage unavailable: the offer simply shows again.
    }
  }, [matchId]);

  const answer = (value: "yes" | "no") => {
    setAnswered(value);
    try {
      window.localStorage.setItem(storageKey(matchId), value);
    } catch {
      // Not remembering is harmless.
    }
    if (value === "yes") {
      // The title, never an id — the same rule as the resume picker.
      void sendMessage({
        parts: [{ type: "text", text: `Tailor my resume "${resumeTitle}" to this job` }],
      });
    }
  };

  if (answered === "no") return null;
  if (answered === "yes") {
    return (
      <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
        Tailoring {resumeTitle} to this job…
      </p>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-sm">Want me to tailor your resume to this job?</span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" onClick={() => answer("yes")}>
          <Wand2 className="mr-2 h-4 w-4" />
          Yes, tailor it
        </Button>
        <Button size="sm" variant="ghost" onClick={() => answer("no")}>
          No thanks
        </Button>
      </div>
    </div>
  );
}
