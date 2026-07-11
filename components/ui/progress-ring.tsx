import { cn } from "@/lib/utils/cn";

type ProgressRingProps = {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
};

export function ProgressRing({
  value,
  size = 104,
  strokeWidth = 11,
  className,
  label
}: ProgressRingProps) {
  const safeValue = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const dashOffset = circumference - (safeValue / 100) * circumference;

  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      aria-label={label ?? `${safeValue}%`}
    >
      <svg width={size} height={size} role="img" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgb(var(--color-coral))"
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="absolute text-xl font-black">{safeValue}%</span>
    </div>
  );
}
