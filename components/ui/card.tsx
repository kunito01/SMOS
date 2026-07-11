import { cn } from "@/lib/utils/cn";

type CardTone = "white" | "aqua" | "lime" | "dark" | "coral" | "glass";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  tone?: CardTone;
};

const tones: Record<CardTone, string> = {
  white: "bg-white text-ink",
  aqua: "bg-aqua text-ink",
  lime: "bg-limepop text-ink",
  dark: "bg-ink text-white",
  coral: "bg-coral text-white",
  glass: "bg-white/[0.72] text-ink backdrop-blur-xl"
};

export function Card({ className, tone = "white", ...props }: CardProps) {
  return (
    <div
      data-jelly-card="true"
      className={cn(
        "smos-game-card rounded-studio-lg shadow-soft ring-1 ring-black/[0.04]",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
