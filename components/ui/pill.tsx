import { cn } from "@/lib/utils/cn";

type PillTone = "aqua" | "lime" | "coral" | "dark" | "cloud";

type PillProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: PillTone;
};

const tones: Record<PillTone, string> = {
  aqua: "bg-aqua/80 text-ink",
  lime: "bg-limepop text-ink",
  coral: "bg-coral text-white",
  dark: "bg-ink text-white",
  cloud: "bg-cloud text-ink"
};

export function Pill({ className, tone = "cloud", ...props }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
