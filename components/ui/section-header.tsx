import { cn } from "@/lib/utils/cn";

type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
  eyebrowClassName?: string;
  titleClassName?: string;
};

export function SectionHeader({ eyebrow, title, action, className, eyebrowClassName, titleClassName }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className={cn("mb-2 text-sm font-bold text-muted", eyebrowClassName)}>{eyebrow}</p> : null}
        <h2 className={cn("text-2xl font-black leading-none text-ink sm:text-3xl", titleClassName)}>{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
