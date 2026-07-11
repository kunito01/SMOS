"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, LockKeyhole, Upload } from "lucide-react";
import { PixelHeroScene } from "@/components/auth/pixel-hero-scene";
import { WorkspaceKeyDialog } from "@/components/auth/workspace-key-dialog";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { SiteFooter } from "@/components/layout/site-footer";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authApi } from "@/lib/api";
import { LocalAuthError } from "@/lib/api/auth";
import {
  parseEncryptedWorkspaceEnvelope,
  type EncryptedWorkspaceEnvelope
} from "@/lib/security/workspace-crypto";

const maxFullSiteBackupBytes = 64 * 1024 * 1024;
const restoredLoginNoticeStorageKey = "studio-map-os.full-site-restored-login-notice";
const restoreFailedLoginNoticeStorageKey = "studio-map-os.full-site-restore-failed-login-notice";

export function LoginPage() {
  const router = useRouter();
  const { isReady, signIn, user } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const restoreInFlightRef = useRef(false);
  const [pendingBackup, setPendingBackup] = useState<EncryptedWorkspaceEnvelope | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [restoreNotice, setRestoreNotice] = useState(false);

  useEffect(() => {
    setEmail(authApi.getLastAccountEmail());
    if (window.sessionStorage.getItem(restoredLoginNoticeStorageKey)) {
      window.sessionStorage.removeItem(restoredLoginNoticeStorageKey);
      setRestoreNotice(true);
    }
    if (window.sessionStorage.getItem(restoreFailedLoginNoticeStorageKey)) {
      window.sessionStorage.removeItem(restoreFailedLoginNoticeStorageKey);
      setError(t("loginRestoreRequired"));
    }
  }, [t]);

  useEffect(() => {
    if (isReady && user) {
      router.replace("/dashboard");
    }
  }, [isReady, router, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof LocalAuthError
        ? cause.code === "INVALID_CREDENTIALS"
          ? t("authInvalidCredentials")
          : cause.code === "STORAGE_CORRUPT"
            ? t("loginRestoreRequired")
            : t("authLoginFailed")
        : t("authLoginFailed"));
    } finally {
      setBusy(false);
    }
  };

  const readFullSiteBackup = async (file: File) => {
    setRestoreError("");
    setRestoreNotice(false);

    try {
      if (file.size > maxFullSiteBackupBytes) {
        throw new Error("The full-site backup is too large");
      }

      const lowerFileName = file.name.toLocaleLowerCase();
      if (!lowerFileName.endsWith(".json") && !lowerFileName.endsWith(".smos-backup")) {
        throw new Error("Unsupported backup file name");
      }

      const envelope = parseEncryptedWorkspaceEnvelope(await file.text(), "device");
      setPendingBackup(envelope);
    } catch {
      setRestoreError(t("loginRestoreDeviceBackupError"));
    }
  };

  const restoreFullSiteBackup = async (workspaceCode: string) => {
    if (!pendingBackup || restoreInFlightRef.current) {
      return;
    }

    restoreInFlightRef.current = true;
    setRestoreBusy(true);
    setRestoreError("");
    setRestoreNotice(false);

    try {
      await authApi.restoreFullSiteBackupOnEmptyDevice(pendingBackup, workspaceCode);
      window.sessionStorage.setItem(restoredLoginNoticeStorageKey, "1");
      window.location.reload();
    } catch (cause) {
      setRestoreError(
        cause instanceof LocalAuthError && cause.code === "DEVICE_NOT_EMPTY"
          ? t("loginRestoreDeviceNotEmpty")
          : t("loginRestoreDeviceBackupError")
      );
    } finally {
      restoreInFlightRef.current = false;
      setRestoreBusy(false);
    }
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

            <p className="mt-auto max-w-2xl border-t border-ink/12 pt-4 text-xs font-bold leading-5 text-ink/56 sm:text-sm sm:leading-6">
              {t("loginStoragePrivacyNote")}
            </p>
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
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
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
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  placeholder={t("loginPasswordPlaceholder")}
                  autoComplete="current-password"
                  required
                  className="h-14 w-full rounded-full border-0 bg-white px-5 text-base font-bold text-ink outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral"
                />
              </label>

              {error ? (
                <p role="alert" className="rounded-studio bg-coral/14 p-4 text-sm font-black text-[#b62f17]">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? t("loading") : t("loginButton")}
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
              <div className="flex items-center gap-3 py-1" aria-hidden="true">
                <span className="h-px flex-1 bg-ink/10" />
                <span className="size-1.5 rounded-full bg-ink/18" />
                <span className="h-px flex-1 bg-ink/10" />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="w-full bg-white/58"
                disabled={busy || restoreBusy}
                onClick={() => backupInputRef.current?.click()}
              >
                <Upload size={19} />
                {restoreBusy ? t("loading") : t("loginRestoreDeviceBackup")}
              </Button>
              <input
                ref={backupInputRef}
                type="file"
                accept=".json,.smos-backup,application/json,application/octet-stream"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) {
                    void readFullSiteBackup(file);
                  }
                }}
              />
              {restoreError && !pendingBackup ? (
                <p role="alert" className="rounded-studio bg-coral/14 p-4 text-sm font-black text-[#b62f17]">
                  {restoreError}
                </p>
              ) : null}
              {restoreNotice ? (
                <p role="status" className="rounded-studio bg-limepop/28 p-4 text-sm font-black text-ink">
                  {t("loginRestoreDeviceBackupSuccess")}
                </p>
              ) : null}
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
      <WorkspaceKeyDialog
        open={Boolean(pendingBackup)}
        busy={restoreBusy}
        error={restoreError}
        title={t("loginRestoreDeviceBackupTitle")}
        description={t("loginRestoreDeviceBackupBody")}
        onCancel={() => {
          setPendingBackup(null);
          setRestoreError("");
        }}
        onConfirm={restoreFullSiteBackup}
      />
    </main>
  );
}
