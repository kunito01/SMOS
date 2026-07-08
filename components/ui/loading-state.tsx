import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

type LoadingStateProps = {
  label: string;
  className?: string;
};

export function LoadingState({ label, className }: LoadingStateProps) {
  return (
    <Card tone="white" className={cn("grid min-h-48 place-items-center p-8", className)}>
      <div className="flex flex-col items-center gap-4">
        <span className="size-14 animate-pulse rounded-full bg-limepop shadow-soft" />
        <p className="text-sm font-black text-muted">{label}</p>
      </div>
    </Card>
  );
}
