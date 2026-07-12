"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type PasswordFieldProps = {
  autoComplete: "current-password" | "new-password";
  error?: string;
  hidePasswordLabel: string;
  id: string;
  label: string;
  minLength?: number;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder: string;
  showPasswordLabel: string;
  surface?: "cloud" | "white";
  value: string;
};

export function PasswordField({
  autoComplete,
  error,
  hidePasswordLabel,
  id,
  label,
  minLength,
  onBlur,
  onChange,
  placeholder,
  showPasswordLabel,
  surface = "white",
  value
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  const toggleLabel = visible ? hidePasswordLabel : showPasswordLabel;
  const VisibilityIcon = visible ? EyeOff : Eye;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-black text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "h-14 w-full rounded-full border-0 px-5 pr-14 text-base font-bold text-ink outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral",
            surface === "cloud" ? "bg-cloud" : "bg-white",
            error && "ring-2 ring-coral"
          )}
        />
        <button
          type="button"
          aria-label={toggleLabel}
          aria-controls={id}
          aria-pressed={visible}
          title={toggleLabel}
          onClick={() => setVisible((current) => !current)}
          className="absolute right-1.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
        >
          <VisibilityIcon aria-hidden="true" size={20} />
        </button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-2 text-sm font-black leading-5 text-[#b62f17]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
