import Image from "next/image";
import { cn } from "@/lib/utils/cn";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type BrandMarkProps = {
  className?: string;
  logoClassName?: string;
};

export function BrandMark({ className, logoClassName }: BrandMarkProps) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-ink text-white",
        className
      )}
    >
      <Image
        src={`${basePath}/brand/smos-logo-02.png`}
        alt=""
        width={722}
        height={742}
        aria-hidden="true"
        draggable={false}
        className={cn("h-[78%] w-[78%] object-contain", logoClassName)}
      />
    </span>
  );
}
