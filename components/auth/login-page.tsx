"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, LockKeyhole, Map, Sparkles } from "lucide-react";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";

const loginStats = [
  { value: "12", labelKey: "loginMetricProjects" },
  { value: "07", labelKey: "loginMetricStages" },
  { value: "02", labelKey: "loginMetricShare" }
] as const;

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
    <main className="min-h-screen p-3 sm:p-5 xl:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1280px] gap-4 xl:min-h-[calc(100vh-3rem)] xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.58fr)]">
        <section className="relative overflow-hidden rounded-studio-xl bg-aqua p-6 shadow-soft sm:p-8 xl:p-10">
          <div className="relative z-10 flex h-full min-h-[32rem] flex-col justify-between gap-10">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-14 place-items-center rounded-full bg-ink text-white">
                  <Map size={25} strokeWidth={2.4} />
                </span>
                <div>
                  <p className="text-sm font-black uppercase text-ink/60">{t("loginEyebrow")}</p>
                  <h1 className="text-2xl font-black leading-none">Studio Map OS</h1>
                </div>
              </div>
              <LanguageToggle compact className="hidden sm:inline-flex" />
            </div>

            <div className="max-w-3xl">
              <Pill tone="lime" className="mb-5">
                <Sparkles size={16} />
                {t("heroPillProduct")}
              </Pill>
              <h2 className="text-4xl font-black leading-[0.95] text-ink sm:text-6xl xl:text-7xl">
                {t("loginTitle")}
              </h2>
              <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-ink/60">
                {t("loginSubtitle")}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {loginStats.map((stat) => (
                <div key={stat.labelKey} className="rounded-studio bg-white/70 p-5 shadow-soft">
                  <p className="text-4xl font-black leading-none">{stat.value}</p>
                  <p className="mt-3 text-sm font-bold text-muted">{t(stat.labelKey)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute -right-16 -top-12 size-72 rounded-full bg-white/[0.34]" />
          <div className="absolute bottom-14 right-10 hidden h-44 w-24 rounded-full bg-limepop sm:block" />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex justify-end sm:hidden">
            <LanguageToggle />
          </div>

          <Card tone="white" className="p-6 sm:p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-muted">{t("loginEyebrow")}</p>
                <h2 className="mt-2 text-3xl font-black leading-none">Studio Map OS</h2>
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
                  className="h-14 w-full rounded-full border-0 bg-cloud px-5 text-base font-bold text-ink outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral"
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
                  className="h-14 w-full rounded-full border-0 bg-cloud px-5 text-base font-bold text-ink outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral"
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

            <Card tone="lime" className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <LockKeyhole size={22} />
                <h3 className="text-xl font-black">{t("loginFeaturePrivate")}</h3>
              </div>
              <p className="text-sm font-bold leading-6 text-ink/70">{t("loginFeaturePrivateBody")}</p>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
