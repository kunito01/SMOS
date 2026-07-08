import { cn } from "@/lib/utils/cn";

type ProgressBarProps = {
  value: number;
  className?: string;
  barClassName?: string;
};

export function ProgressBar({ value, className, barClassName }: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("h-3 overflow-hidden rounded-full bg-black/[0.08]", className)}>
      <div
        className={cn("h-full rounded-full bg-coral transition-all duration-500 ease-out", barClassName)}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
