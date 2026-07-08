import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type MetricTileTone = "aqua" | "lime" | "coral" | "dark";

type MetricTileProps = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: MetricTileTone;
  className?: string;
};

const toneClasses: Record<MetricTileTone, string> = {
  aqua: "bg-aqua text-ink",
  lime: "bg-limepop text-ink",
  coral: "bg-coral text-white",
  dark: "bg-ink text-white"
};

export function MetricTile({ label, value, icon: Icon, tone = "lime", className }: MetricTileProps) {
  return (
    <div className={cn("rounded-studio bg-white/72 p-4 shadow-soft", className)}>
      <div className="mb-5 flex items-center justify-between">
        <span className={cn("grid size-11 place-items-center rounded-full", toneClasses[tone])}>
          <Icon size={20} />
        </span>
        <ChevronRight size={20} />
      </div>
      <p className="text-4xl font-black leading-none">{value}</p>
      <p className="mt-2 text-sm font-bold text-muted">{label}</p>
    </div>
  );
}
