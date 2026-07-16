import { cn } from "@/lib/utils/cn";
import { getProjectPublishedReleaseKinds, type PublishedReleaseKind } from "@/lib/utils/project-release";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Project } from "@/lib/types";

type ProjectReleaseBadgesProps = {
  project: Project;
  t: (key: TranslationKey) => string;
  className?: string;
  size?: "compact" | "hero";
  fixedLayout?: boolean;
};

const releaseLabelKeys: Record<PublishedReleaseKind, TranslationKey> = {
  demo: "demoPublished",
  official: "officialPublished"
};

const releaseToneClasses: Record<PublishedReleaseKind, string> = {
  demo: "bg-limepop text-ink ring-white/50",
  official: "bg-coral text-white ring-white/35"
};

export function ProjectReleaseBadges({
  project,
  t,
  className,
  size = "compact",
  fixedLayout = false
}: ProjectReleaseBadgesProps) {
  const releases = getProjectPublishedReleaseKinds(project);

  if (!releases.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2",
        !fixedLayout && "max-[560px]:gap-1.5 max-[360px]:gap-1",
        className
      )}
    >
      {releases.map((release) => (
        <span
          key={release}
          className={cn(
            "inline-flex min-h-9 max-w-full items-center justify-center rounded-full px-3 text-center text-xs font-black leading-tight shadow-soft ring-1 backdrop-blur-xl [overflow-wrap:anywhere]",
            !fixedLayout && "max-[560px]:min-h-8 max-[560px]:px-2.5 max-[560px]:text-[11px] max-[420px]:min-h-7 max-[420px]:px-2 max-[420px]:text-[10px]",
            size === "hero" && "h-12 px-5 text-base",
            size === "hero" && !fixedLayout && "max-[560px]:h-10 max-[560px]:px-3 max-[560px]:text-xs max-[420px]:h-8 max-[420px]:px-2.5 max-[420px]:text-[11px] max-[360px]:h-7 max-[360px]:px-2 max-[360px]:text-[10px]",
            releaseToneClasses[release]
          )}
        >
          {t(releaseLabelKeys[release])}
        </span>
      ))}
    </div>
  );
}
