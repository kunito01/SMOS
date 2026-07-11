"use client";

import { useI18n } from "@/components/providers/app-providers";
import { cn } from "@/lib/utils/cn";

type SiteFooterProps = {
  className?: string;
  dockSafe?: boolean;
};

export function SiteFooter({ className, dockSafe = false }: SiteFooterProps) {
  const { t } = useI18n();

  return (
    <footer
      className={cn(
        "mx-auto w-full max-w-[1480px] px-4 pb-2 pt-6 text-center text-xs font-semibold leading-5 text-ink/48 max-[560px]:font-bold max-[360px]:text-[10px] max-[360px]:leading-4 sm:px-6 xl:px-8",
        dockSafe && "pb-[calc(7rem+env(safe-area-inset-bottom))] xl:pb-2",
        className
      )}
    >
      <p>
        <span className="max-[560px]:block">{t("footerCopyright")}</span>{" "}
        <span className="max-[560px]:block">{t("footerRights")}</span>
      </p>
      <p className="max-[560px]:mt-3">
        <span className="max-[560px]:block">{t("footerCollaboration")}</span>{" "}
        <span className="max-[560px]:block max-[560px]:whitespace-nowrap">
          <a
            href="mailto:kunito.world@icloud.com"
            className="font-black text-[#FF0099] underline-offset-4 transition hover:underline"
          >
            kunito.world@icloud.com
          </a>{" "}
          {t("footerMoreInfo")}
        </span>
      </p>
    </footer>
  );
}
