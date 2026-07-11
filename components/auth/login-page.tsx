"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { PixelHeroScene } from "@/components/auth/pixel-hero-scene";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { SiteFooter } from "@/components/layout/site-footer";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function LoginPage() {
  const router = useRouter();
  const { isReady, signIn, user } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("studio@example.com");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isReady && user) {
      router.replace("/dashboard");
    }
  }, [isReady, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await signIn(email, password);
    router.replace("/dashboard");
  };

  return (
    <main className="min-h-dvh p-3 sm:p-5 xl:p-6">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-[1280px] gap-4 xl:min-h-[calc(100dvh-3rem)] xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.58fr)]">
        <section className="relative overflow-hidden rounded-studio-xl bg-aqua p-6 text-ink shadow-soft sm:p-8 xl:p-10">
          <PixelHeroScene />
          <div className="relative z-10 flex h-full min-h-[34rem] flex-col gap-10 sm:min-h-[36rem] xl:min-h-[32rem]">
            <div className="flex items-start justify-between gap-3 max-[360px]:flex-wrap sm:gap-4">
              <BrandLockup
                subtitle={t("loginEyebrow")}
                size="hero"
                markClassName="shadow-[0_18px_42px_rgba(59,137,167,0.18)]"
              />
              <LanguageToggle compact variant="dropdown" className="ml-auto" />
            </div>

            <div className="max-w-3xl">
              <h2 className="max-w-4xl text-4xl font-black leading-[0.95] text-ink drop-shadow-[0_3px_0_rgba(255,255,255,0.46)] sm:text-6xl xl:text-7xl">
                {t("loginTitle")}
              </h2>
              <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-ink/62">
                {t("loginSubtitle")}
              </p>
            </div>

          </div>
        </section>

        <section className="flex flex-col gap-4">
          <Card tone="white" className="bg-[#e9e5df] p-6 sm:p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-muted">{t("loginEyebrow")}</p>
                <h2 className="font-brand mt-2 text-3xl leading-none">Studio Map OS</h2>
              </div>
              <span className="grid size-14 place-items-center rounded-full bg-limepop">
                <LockKeyhole size={23} />
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-ink">{t("loginEmail")}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("loginEmailPlaceholder")}
                  autoComplete="email"
                  required
                  className="h-14 w-full rounded-full border-0 bg-white px-5 text-base font-bold text-ink outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-ink">{t("loginPassword")}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t("loginPasswordPlaceholder")}
                  autoComplete="current-password"
                  required
                  className="h-14 w-full rounded-full border-0 bg-white px-5 text-base font-bold text-ink outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral"
                />
              </label>

              <Button type="submit" size="lg" className="w-full">
                {t("loginButton")}
                <ArrowRight size={19} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="w-full"
                onClick={() => router.push("/register")}
              >
                {t("loginSecondary")}
              </Button>
            </form>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Card tone="dark" className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <CheckCircle2 size={22} className="text-limepop" />
                <h3 className="text-xl font-black">{t("loginFeatureMap")}</h3>
              </div>
              <p className="text-sm font-bold leading-6 text-white/70">{t("loginFeatureMapBody")}</p>
            </Card>

            <Card tone="lime" className="bg-[#ffc700] p-6">
              <div className="mb-4 flex items-center gap-3">
                <LockKeyhole size={22} />
                <h3 className="text-xl font-black">{t("loginFeaturePrivate")}</h3>
              </div>
              <p className="text-sm font-bold leading-6 text-ink/70">{t("loginFeaturePrivateBody")}</p>
            </Card>
          </div>
          <SiteFooter className="pt-2 xl:max-w-none xl:px-0" />
        </section>
      </div>
    </main>
  );
}
