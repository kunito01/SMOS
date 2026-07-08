import { cn } from "@/lib/utils/cn";

type ImageCardProps = React.HTMLAttributes<HTMLDivElement> & {
  imageUrl: string;
  title: string;
  meta?: string;
  heightClassName?: string;
};

export function ImageCard({
  imageUrl,
  title,
  meta,
  className,
  heightClassName = "h-72",
  children,
  ...props
}: ImageCardProps) {
  return (
    <div
      className={cn(
        "image-vignette flex min-w-0 flex-col justify-end rounded-studio-xl bg-cover bg-center p-5 text-white shadow-soft",
        heightClassName,
        className
      )}
      style={{ backgroundImage: `url(${imageUrl})` }}
      {...props}
    >
      <div className="relative z-10">
        {meta ? <p className="mb-2 text-sm font-bold text-white/[0.82]">{meta}</p> : null}
        <h3 className="max-w-56 text-2xl font-black leading-none">{title}</h3>
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  );
}
