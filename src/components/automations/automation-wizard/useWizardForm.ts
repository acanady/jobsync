"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateAutomationSchema,
  type CreateAutomationInput,
} from "@/models/automation.schema";
import {
  createAutomation,
  updateAutomation,
} from "@/actions/automation.actions";
import { toastSuccess, toastError } from "@/lib/toast";
import { APP_CONSTANTS } from "@/lib/constants";
import type {
  AutomationBoard,
  AutomationWithResume,
} from "@/models/automation.model";
import type { AtsConfigValue } from "../AtsSearchStep";
import type { SearchConfigValue } from "../ats-search-step/types";
import {
  EMPTY_ATS,
  EMPTY_SEARCH,
  STEPS,
  parseEditSourceConfig,
} from "./wizardConfig";

interface UseWizardFormArgs {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automations: AutomationWithResume[];
  onSuccess: () => void;
  editAutomation?: AutomationWithResume | null;
}

export function useWizardForm({
  open,
  onOpenChange,
  automations,
  onSuccess,
  editAutomation,
}: UseWizardFormArgs) {
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateAutomationInput>({
    resolver: zodResolver(CreateAutomationSchema),
    mode: "onChange",
    defaultValues: {
      name: editAutomation?.name ?? "",
      jobBoard: (editAutomation?.jobBoard as AutomationBoard) ?? "greenhouse",
      keywords: editAutomation?.keywords ?? "",
      location: editAutomation?.location ?? "",
      sourceConfig: parseEditSourceConfig(editAutomation?.sourceConfig),
      resumeId: editAutomation?.resumeId ?? "",
      matchThreshold: editAutomation?.matchThreshold ?? 80,
      scheduleHour: editAutomation?.scheduleHour ?? 8,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: editAutomation?.name ?? "",
        jobBoard: (editAutomation?.jobBoard as AutomationBoard) ?? "greenhouse",
        keywords: editAutomation?.keywords ?? "",
        location: editAutomation?.location ?? "",
        sourceConfig: parseEditSourceConfig(editAutomation?.sourceConfig),
        resumeId: editAutomation?.resumeId ?? "",
        matchThreshold: editAutomation?.matchThreshold ?? 80,
        scheduleHour: editAutomation?.scheduleHour ?? 8,
      });
      setStep(0);
    }
  }, [open, editAutomation, form]);

  const formValues = form.watch();

  const onSubmit = async (data: CreateAutomationInput) => {
    setIsSubmitting(true);
    try {
      const result = editAutomation
        ? await updateAutomation(editAutomation.id, data)
        : await createAutomation(data);

      if (result.success) {
        toastSuccess(
          editAutomation
            ? "Your automation has been updated successfully."
            : "Your automation has been created and will run at the scheduled time.",
          editAutomation ? "Automation updated" : "Automation created",
        );
        form.reset();
        setStep(0);
        onOpenChange(false);
        onSuccess();
      } else {
        toastError(result.message || "Something went wrong");
      }
    } catch (error) {
      toastError("Failed to save automation");
    } finally {
      setIsSubmitting(false);
    }
  };

  // The config being edited lives under the selected board's key; a board
  // switch starts from that board's empty config.
  const atsKey: AutomationBoard = formValues.jobBoard ?? "greenhouse";
  const isSearch = atsKey === "jobspy";
  const atsConfig: AtsConfigValue =
    (atsKey !== "jobspy" && formValues.sourceConfig?.[atsKey]) || EMPTY_ATS;
  const searchConfig: SearchConfigValue =
    formValues.sourceConfig?.jobspy ?? EMPTY_SEARCH;
  // What a JobSpy automation will search: its search terms, else its titles.
  const searchCount = (
    searchConfig.searchTerms?.length
      ? searchConfig.searchTerms
      : (searchConfig.targetTitles ?? [])
  ).length;

  const canGoNext = () => {
    switch (step) {
      case 0:
        return (formValues.name?.trim().length ?? 0) > 0;
      case 1:
        return isSearch
          ? searchCount > 0 &&
              searchCount <= APP_CONSTANTS.JOBSPY_MAX_SEARCH_TERMS
          : (atsConfig.companies?.length ?? 0) > 0;
      case 2:
        return (formValues.resumeId?.length ?? 0) > 0;
      case 3:
      case 4:
        return true;
      default:
        return false;
    }
  };

  // Hours already claimed by the user's other automations. Only one automation
  // may run per hourly slot, so the schedule step rejects a taken hour.
  const takenHours = new Set(
    automations
      .filter((a) => a.id !== editAutomation?.id)
      .map((a) => a.scheduleHour),
  );

  const nextStep = () => {
    if (step === 4 && takenHours.has(formValues.scheduleHour)) {
      form.setError("scheduleHour", {
        message: `Another automation already runs at ${(
          formValues.scheduleHour ?? 8
        )
          .toString()
          .padStart(2, "0")}:00. Please choose a different time.`,
      });
      return;
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleClose = () => {
    form.reset();
    setStep(0);
    onOpenChange(false);
  };

  return {
    form,
    formValues,
    step,
    isSubmitting,
    atsKey,
    atsConfig,
    searchConfig,
    takenHours,
    canGoNext,
    nextStep,
    prevStep,
    handleClose,
    onSubmit,
  };
}
