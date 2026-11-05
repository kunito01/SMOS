import { cn } from "@/lib/utils/cn";

type ProgressBarProps = {
  value: number;
  className?: string;
  barClassName?: string;
};

export function ProgressBar({ value, className, barClassName }: ProgressBarProps) {
  const safeValue = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div
      className={cn("relative h-3 overflow-hidden rounded-full bg-black/[0.08]", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue)}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full bg-coral transition-[width] duration-500 ease-out",
          safeValue > 0 && "min-w-3",
          barClassName
        )}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
