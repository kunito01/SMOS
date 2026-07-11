"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { useI18n } from "@/components/providers/app-providers";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

export function MissingQueryRedirect({ href }: { href: string }) {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        <LoadingState label={t("loading")} className="min-h-[28rem]" />
      </div>
    </AppShell>
  );
}

export function MissingPublicShareToken() {
  const { t } = useI18n();

  return (
    <AppShell>
      <div className="studio-scroll flex-1 overflow-y-auto px-4 pb-8 sm:px-6 xl:px-8">
        <div className="grid min-h-[28rem] place-items-center">
          <Card tone="white" className="max-w-xl p-8 text-center">
            <h1 className="text-3xl font-black">{t("shareUnavailable")}</h1>
            <Link
              href="/login"
              className="font-brand mt-6 inline-flex h-12 items-center rounded-full bg-ink px-5 text-sm text-white"
            >
              Studio Map OS
            </Link>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
