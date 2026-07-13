import { cn } from "@/lib/utils/cn";

type ImageCardProps = React.HTMLAttributes<HTMLDivElement> & {
  imageUrl: string;
  title: string;
  meta?: string;
  heightClassName?: string;
  action?: React.ReactNode;
};

export function ImageCard({
  imageUrl,
  title,
  meta,
  className,
  heightClassName = "h-72",
  action,
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
      <div className="relative z-10">
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
