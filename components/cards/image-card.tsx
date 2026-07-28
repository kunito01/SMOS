import { cn } from "@/lib/utils/cn";

type ImageCardProps = React.HTMLAttributes<HTMLDivElement> & {
  imageUrl: string;
  title: string;
  meta?: string;
  heightClassName?: string;
  action?: React.ReactNode;
  /** Brand logo shown in the bottom content block, just above the meta line. */
  logoUrl?: string;
  /** Brand logo pinned to the top-left corner of the card. */
  cornerLogoUrl?: string;
};

export function ImageCard({
  imageUrl,
  title,
  meta,
  className,
  heightClassName = "h-72",
  action,
  logoUrl,
  cornerLogoUrl,
  children,
  ...props
}: ImageCardProps) {
  return (
    <div
      data-jelly-card="true"
      className={cn(
        "image-vignette smos-game-card flex min-w-0 flex-col justify-end rounded-studio-xl bg-cover bg-center p-5 text-white shadow-soft",
        heightClassName,
        className
      )}
      style={{ backgroundImage: `url(${imageUrl})` }}
      {...props}
    >
      {action ? <div className="absolute right-5 top-5 z-20">{action}</div> : null}
      {cornerLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cornerLogoUrl}
          alt=""
          className="absolute left-5 top-5 z-20 h-14 w-auto max-w-[45%] object-contain object-left-top"
        />
      ) : null}
      <div className="relative z-10">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="mb-3 h-12 w-auto max-w-[60%] object-contain object-left-bottom" />
        ) : null}
        {meta ? (
          <p className="mb-2 max-w-full break-words text-xs font-bold leading-tight text-white/[0.82] sm:text-sm">
            {meta}
          </p>
        ) : null}
        <h3 className="max-w-full break-words text-xl font-black leading-tight [overflow-wrap:anywhere] sm:max-w-56 sm:text-2xl sm:leading-none">
          {title}
        </h3>
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  );
}
