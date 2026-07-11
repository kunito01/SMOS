import { BrandMark } from "@/components/brand/brand-mark";
import { cn } from "@/lib/utils/cn";

type BrandLockupSize = "shell" | "hero";

type BrandLockupProps = {
  subtitle: string;
  title?: string;
  size?: BrandLockupSize;
  className?: string;
  markClassName?: string;
  subtitleClassName?: string;
  titleClassName?: string;
};

const sizeClasses: Record<BrandLockupSize, {
  root: string;
  mark: string;
  copy: string;
  subtitle: string;
  title: string;
}> = {
  shell: {
    root: "gap-[5.333px] max-[482px]:gap-1 max-[370px]:gap-[3px] sm:gap-[6.667px]",
    mark: "size-[31.2px] max-[482px]:size-7 max-[400px]:size-6 max-[370px]:size-[22px] sm:size-[36.4px]",
    copy: "h-[31.2px] justify-between max-[482px]:h-7 max-[400px]:h-6 max-[370px]:h-[22px] sm:h-[36.4px]",
    subtitle: "h-[6.5px] text-[6.5px] leading-[6.5px] max-[482px]:h-[5px] max-[482px]:text-[5px] max-[482px]:leading-[5px] max-[400px]:h-[4.5px] max-[400px]:text-[4.5px] max-[400px]:leading-[4.5px] max-[370px]:h-1 max-[370px]:text-[4px] max-[370px]:leading-[4px] sm:text-[7.8px]",
    title: "h-[19.5px] text-[16.12px] !leading-[19.5px] max-[482px]:h-[17px] max-[482px]:text-[13px] max-[482px]:!leading-[17px] max-[400px]:h-[15.5px] max-[400px]:text-xs max-[400px]:!leading-[15.5px] max-[370px]:h-[13px] max-[370px]:text-[10px] max-[370px]:!leading-[13px] sm:text-[18.2px]"
  },
  hero: {
    root: "gap-1 sm:gap-[5.333px]",
    mark: "size-[36.4px] min-[400px]:size-[41.6px] sm:size-[46.8px]",
    copy: "h-[36.4px] justify-between min-[400px]:h-[41.6px] sm:h-[46.8px]",
    subtitle: "h-[7.15px] text-[7.15px] leading-[7.15px] min-[400px]:text-[7.8px] sm:h-[9.1px] sm:text-[9.1px] sm:leading-[9.1px]",
    title: "h-[20.8px] text-[17.68px] !leading-[20.8px] min-[400px]:text-[19.5px] sm:h-[26px] sm:text-[24.44px] sm:!leading-[26px]"
  }
};

export function BrandLockup({
  subtitle,
  title = "STUDIO MAP OS",
  size = "shell",
  className,
  markClassName,
  subtitleClassName,
  titleClassName
}: BrandLockupProps) {
  const styles = sizeClasses[size];

  return (
    <span className={cn("flex min-w-0 items-center", styles.root, className)}>
      <BrandMark className={cn(styles.mark, markClassName)} logoClassName="h-[80%] w-[80%]" />
      <span className={cn("flex min-w-0 flex-col transform-gpu", styles.copy)}>
        <span className={cn("block font-black uppercase leading-none text-ink/72", styles.subtitle, subtitleClassName)}>
          {subtitle}
        </span>
        <span className={cn("brand-lockup-title font-brand mt-[1.3px] block whitespace-nowrap text-ink sm:mt-[2.6px]", styles.title, titleClassName)}>
          {title}
        </span>
      </span>
    </span>
  );
}
