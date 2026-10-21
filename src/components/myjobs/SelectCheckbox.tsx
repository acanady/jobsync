"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type SelectCheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
};

// Native checkbox (the UI kit has no checkbox primitive); `indeterminate` is a
// DOM-only property, so it is set through a ref.
export function SelectCheckbox({
  checked,
  indeterminate = false,
  onCheckedChange,
  label,
  className,
}: SelectCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      title={label}
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      className={cn("h-4 w-4 cursor-pointer accent-primary", className)}
    />
  );
}
