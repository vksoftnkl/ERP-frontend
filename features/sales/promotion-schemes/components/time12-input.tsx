"use client";

/**
 * A time of day typed and shown 12-hour (`hh:mm AM`, Qt's `hh:mm AP` time
 * edit), held 24-hour (`HH:mm`). Any readable time a keystroke completes is
 * taken at once — `10:30 pm`, `1030p`, `22:30` — so a save straight from the
 * box sees it; leaving the box shows it in the house format again.
 */
import { useState } from "react";
import { Input } from "@/components/design-system/ui";
import { clock12FromHhmm } from "@/lib/time-format";
import { parseTime12 } from "../promotion-schemes.state";

export type Time12InputProps = {
  id: string;
  value: string;
  disabled?: boolean;
  title?: string;
  className?: string;
  onChange: (hhmm: string) => void;
};

export function Time12Input({ id, value, disabled, title, className, onChange }: Time12InputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      id={id}
      className={className}
      data-walk="true"
      data-focus-key={`field:${id}`}
      value={draft ?? clock12FromHhmm(value)}
      placeholder="hh:mm AM"
      disabled={disabled}
      title={title}
      onFocus={(event) => {
        setDraft(clock12FromHhmm(value));
        event.target.select();
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = parseTime12(event.target.value);
        if (parsed && parsed !== value) onChange(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
