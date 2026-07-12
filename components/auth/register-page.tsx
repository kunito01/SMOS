"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Download,
  FileKey2,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserPlus
} from "lucide-react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { SiteFooter } from "@/components/layout/site-footer";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { authApi } from "@/lib/api";
import { LocalAuthError, type WorkspaceRegistrationMode } from "@/lib/api/auth";
import {
  WorkspaceCryptoError,
  formatWorkspaceCode,
  generateWorkspaceCode,
  isValidWorkspaceCode,
  parseEncryptedWorkspaceEnvelope,
  type EncryptedWorkspaceEnvelope
} from "@/lib/security/workspace-crypto";

const maxEncryptedBackupBytes = 64 * 1024 * 1024;

const sanitizeWorkspaceCodeInput = (value: string) => value.replace(/\D/g, "").slice(0, 16);

export function RegisterPage() {
  const router = useRouter();
  const { isReady, signUp, user } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceRegistrationMode>("create");
  const [workspaceCode, setWorkspaceCode] = useState("");
  const [workspaceBackup, setWorkspaceBackup] = useState<File | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [emptyRecoveryAcknowledged, setEmptyRecoveryAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [claimsLegacyData, setClaimsLegacyData] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    try {
      setWorkspaceCode(generateWorkspaceCode());
      setAcknowledged(false);
    } catch {
      setError(t("authSecureContextRequired"));
      return;
    }

    try {
      setClaimsLegacyData(authApi.hasUnclaimedLegacyData());
    } catch {
      setError(t("authRegistrationFailed"));
    }
  }, [t]);

  useEffect(() => {
    if (isReady && user) {
      router.replace("/dashboard");
    }
  }, [isReady, router, user]);

  const setMode = (mode: WorkspaceRegistrationMode) => {
    setWorkspaceMode(mode);
    setAcknowledged(false);
    setEmptyRecoveryAcknowledged(false);
    setCopied(false);
    setError("");
    setWorkspaceBackup(null);

    if (mode === "create") {
      try {
        setWorkspaceCode(generateWorkspaceCode());
      } catch {
        setWorkspaceCode("");
        setError(t("authSecureContextRequired"));
      }
    } else {
      setWorkspaceCode("");
    }
  };

  const regenerateWorkspaceCode = () => {
    try {
      setWorkspaceCode(generateWorkspaceCode());
      setAcknowledged(false);
      setCopied(false);
      setError("");
    } catch {
      setError(t("authSecureContextRequired"));
    }
  };

  const copyWorkspaceCode = async () => {
    if (!isValidWorkspaceCode(workspaceCode)) {
      setError(t("workspaceKeyInvalid"));
      return;
    }

    const formattedCode = formatWorkspaceCode(workspaceCode);

    try {
      await navigator.clipboard.writeText(formattedCode);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = formattedCode;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.append(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const downloadRecoveryCard = () => {
    if (!isValidWorkspaceCode(workspaceCode)) {
      setError(t("workspaceKeyInvalid"));
      return;
    }

    const content = [
      t("workspaceRecoveryCardTitle"),
      "Studio Map OS",
      "",
      `${t("workspaceKeyLabel")}: ${formatWorkspaceCode(workspaceCode)}`,
      "",
      t("workspaceRecoveryCardWarning"),
      t("workspaceKeyOnlyOnce"),
      "",
      t("workspaceRecoveryCardDataNotice")
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");

    link.href = url;
    link.download = `studio-map-os-recovery-key-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const getRegistrationError = (cause: unknown) => {
    if (cause instanceof LocalAuthError) {
      switch (cause.code) {
        case "ACCOUNT_EXISTS":
          return t("authAccountExists");
        case "PASSWORD_TOO_SHORT":
          return t("authPasswordTooShort");
        case "INVALID_CREDENTIALS":
          return t("authInvalidCredentials");
        case "INVALID_WORKSPACE_CODE":
          return t("workspaceKeyInvalid");
        case "WORKSPACE_CODE_IN_USE":
          return t("workspaceKeyExistingAccount");
        case "WORKSPACE_NOT_FOUND":
          return t("workspaceKeyNotFound");
        case "BACKUP_REQUIRED":
          return t("workspaceKeyBackupRequired");
        case "EMPTY_WORKSPACE_RESET_BLOCKED":
          return t("workspaceKeyRecoverEmptyBlocked");
        case "BACKUP_TOO_LARGE":
          return t("siteBackupTooLarge");
        case "BACKUP_INVALID":
        case "WORKSPACE_MISMATCH":
          return t("workspaceKeyMismatchOrCorrupt");
        case "SECURE_CONTEXT_REQUIRED":
          return t("authSecureContextRequired");
        default:
          return t("authRegistrationFailed");
      }
    }

    if (cause instanceof WorkspaceCryptoError) {
      return cause.code === "CRYPTO_UNAVAILABLE"
        ? t("authSecureContextRequired")
        : t("workspaceKeyMismatchOrCorrupt");
    }

    return t("authRegistrationFailed");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!isValidWorkspaceCode(workspaceCode)) {
      setError(t("workspaceKeyInvalid"));
      return;
    }

    if (!acknowledged) {
      return;
    }

    if (workspaceMode === "recover-empty" && !emptyRecoveryAcknowledged) {
      return;
    }

    setBusy(true);

    try {
      let encryptedBackup: EncryptedWorkspaceEnvelope | undefined;

      if (workspaceBackup) {
        if (workspaceBackup.size > maxEncryptedBackupBytes) {
          throw new LocalAuthError("BACKUP_TOO_LARGE", "The encrypted backup is too large");
        }

        encryptedBackup = parseEncryptedWorkspaceEnvelope(await workspaceBackup.text(), "workspace");
      }

      await signUp({
        name,
        email,
        password,
        workspaceCode,
        workspaceMode,
        workspaceBackup: encryptedBackup
      });
      setWorkspaceCode("");
      router.replace("/dashboard");
    } catch (cause) {
      setError(getRegistrationError(cause));
    } finally {
      setBusy(false);
    }
  };

  const formattedWorkspaceCode = formatWorkspaceCode(workspaceCode);

  return (
    <main className="min-h-dvh p-3 sm:p-5 xl:p-6">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-[1280px] gap-4 xl:min-h-[calc(100dvh-3rem)] xl:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.58fr)]">
        <section className="relative overflow-hidden rounded-studio-xl bg-limepop p-6 shadow-soft sm:p-8 xl:p-10">
          <div className="relative z-10 flex h-full min-h-[32rem] flex-col justify-between gap-10">
            <div className="flex items-start justify-between gap-3 max-[360px]:flex-wrap sm:gap-4">
              <BrandLockup subtitle={t("loginEyebrow")} size="hero" />
              <LanguageToggle compact variant="dropdown" className="ml-auto" />
            </div>

            <div className="max-w-3xl">
              <Pill tone="dark" className="mb-5">
                <FileKey2 size={16} />
                {t("workspaceKeyTitle")}
              </Pill>
              <h2 className="text-4xl font-black leading-[0.95] text-ink sm:text-6xl xl:text-7xl">
                {t("registerTitle")}
              </h2>
              <p className="mt-6 max-w-2xl text-lg font-bold leading-8 text-ink/65">
                {t("workspaceKeyWarningBody")}
              </p>
            </div>
          </div>
          <div className="absolute -right-16 -top-12 size-72 rounded-full bg-white/[0.36]" />
          <div className="absolute bottom-14 right-10 hidden h-44 w-24 rounded-full bg-aqua sm:block" />
        </section>

        <section className="flex flex-col gap-4">
          <Card tone="white" className="p-6 sm:p-8">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-muted">{t("registerEyebrow")}</p>
                <h2 className="font-brand mt-2 text-3xl leading-none">Studio Map OS</h2>
              </div>
              <span className="grid size-14 place-items-center rounded-full bg-aqua">
                <UserPlus size={23} />
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-ink">{t("registerName")}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("registerNamePlaceholder")}
                  autoComplete="name"
                  required
                  className="h-14 w-full rounded-full border-0 bg-cloud px-5 text-base font-bold text-ink outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral"
                />
              </label>

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
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="h-14 w-full rounded-full border-0 bg-cloud px-5 text-base font-bold text-ink outline-none ring-1 ring-black/[0.04] transition focus:bg-white focus:ring-2 focus:ring-coral"
                />
              </label>

              <div className="grid gap-2 rounded-studio-lg bg-cloud p-1 sm:grid-cols-3">
                {([
                  ["create", t("workspaceKeyCreateMode")],
                  ["join", t("workspaceKeyJoinMode")],
                  ["recover-empty", t("workspaceKeyRecoverEmptyMode")]
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={workspaceMode === mode}
                    onClick={() => setMode(mode)}
                    className={`min-h-11 rounded-studio px-3 text-sm font-black transition ${
                      workspaceMode === mode ? "bg-ink text-white shadow-soft" : "text-muted hover:bg-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-studio-lg bg-[#1c2328] text-white shadow-soft ring-1 ring-black/10">
                <div className="bg-coral px-5 py-4 text-white">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 shrink-0" size={24} />
                    <div>
                      <p className="text-base font-black uppercase tracking-[0.08em]">
                        {workspaceMode === "create"
                          ? t("workspaceKeyWarningTitle")
                          : workspaceMode === "join"
                            ? t("workspaceKeyTitle")
                            : t("workspaceKeyRecoverEmptyWarningTitle")}
                      </p>
                      <p className="mt-1 text-sm font-bold leading-6 text-white/88">
                        {workspaceMode === "create"
                          ? t("workspaceKeyOnlyOnce")
                          : workspaceMode === "join"
                            ? t("workspaceKeyJoinHelp")
                            : t("workspaceKeyRecoverEmptyWarningBody")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-center gap-2 text-sm font-black text-white/58">
                    <KeyRound size={17} />
                    {t("workspaceKeyLabel")}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    readOnly={workspaceMode === "create"}
                    value={formattedWorkspaceCode}
                    onChange={(event) => {
                      if (workspaceMode === "create") {
                        return;
                      }

                      setWorkspaceCode(sanitizeWorkspaceCodeInput(event.target.value));
                      setAcknowledged(false);
                      setEmptyRecoveryAcknowledged(false);
                      setCopied(false);
                      setError("");
                    }}
                    placeholder="XXXX-XXXX-XXXX-XXXX"
                    aria-label={t("workspaceKeyLabel")}
                    className="mt-3 h-16 w-full rounded-studio bg-white/[0.08] px-3 text-center font-mono text-[clamp(1rem,4vw,1.45rem)] font-black tracking-[0.08em] text-limepop outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-limepop read-only:cursor-default"
                  />
                  <p className="mt-3 text-xs font-bold leading-5 text-white/58">
                    {workspaceMode === "create"
                      ? t("workspaceKeyCreateHelp")
                      : workspaceMode === "join"
                        ? t("workspaceKeyJoinHelp")
                        : t("workspaceKeyRecoverEmptyHelp")}
                  </p>

                  {workspaceMode === "create" ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void copyWorkspaceCode()}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-black text-ink transition hover:bg-limepop"
                      >
                        <Copy size={17} />
                        {copied ? t("workspaceKeyCopied") : t("workspaceKeyCopy")}
                      </button>
                      <button
                        type="button"
                        onClick={downloadRecoveryCard}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/10 px-4 text-sm font-black text-white transition hover:bg-white/18"
                      >
                        <Download size={17} />
                        {t("workspaceKeyDownload")}
                      </button>
                    </div>
                  ) : null}

                  {workspaceMode === "create" ? (
                    <button
                      type="button"
                      onClick={regenerateWorkspaceCode}
                      className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full text-xs font-black text-white/62 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <RefreshCw size={15} />
                      {t("workspaceKeyRegenerate")}
                    </button>
                  ) : workspaceMode === "join" ? (
                    <label className="mt-4 block rounded-studio bg-white/[0.06] p-4">
                      <span className="flex items-center gap-2 text-sm font-black text-white">
                        <Upload size={17} />
                        {t("workspaceKeyBackupLabel")}
                      </span>
                      <span className="mt-1 block text-xs font-bold leading-5 text-white/52">
                        {t("workspaceKeyBackupHelp")}
                      </span>
                      <input
                        type="file"
                        accept=".json,.smos-backup,application/json"
                        onChange={(event) => {
                          setWorkspaceBackup(event.target.files?.[0] ?? null);
                          setError("");
                        }}
                        className="mt-3 block w-full text-xs font-bold text-white/72 file:mr-3 file:rounded-full file:border-0 file:bg-limepop file:px-4 file:py-2 file:text-xs file:font-black file:text-ink"
                      />
                      {workspaceBackup ? (
                        <span className="mt-2 block truncate text-xs font-black text-limepop">
                          {workspaceBackup.name}
                        </span>
                      ) : null}
                    </label>
                  ) : (
                    <div className="mt-4 rounded-studio bg-coral/16 p-4 ring-1 ring-coral/40">
                      <div className="flex items-start gap-3">
                        <ShieldAlert className="mt-0.5 shrink-0 text-coral" size={20} />
                        <div>
                          <p className="text-sm font-black text-white">
                            {t("workspaceKeyRecoverEmptyWarningTitle")}
                          </p>
                          <p className="mt-1 text-xs font-bold leading-5 text-white/68">
                            {t("workspaceKeyRecoverEmptyWarningBody")}
                          </p>
                        </div>
                      </div>

                      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-studio bg-black/20 p-3">
                        <input
                          type="checkbox"
                          checked={emptyRecoveryAcknowledged}
                          onChange={(event) => setEmptyRecoveryAcknowledged(event.target.checked)}
                          className="mt-0.5 size-5 shrink-0 accent-[#ff4629]"
                        />
                        <span className="text-xs font-black leading-5 text-white">
                          {t("workspaceKeyRecoverEmptyConfirm")}
                        </span>
                      </label>
                    </div>
                  )}

                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-studio bg-limepop/[0.12] p-4 ring-1 ring-limepop/20">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                      className="mt-0.5 size-5 shrink-0 accent-[#e3f596]"
                    />
                    <span className="text-sm font-black leading-6 text-limepop">
                      {t("workspaceKeySavedConfirm")}
                    </span>
                  </label>
                </div>
              </div>

              {claimsLegacyData && workspaceMode === "create" ? (
                <p className="rounded-studio bg-aqua/35 p-4 text-sm font-black leading-6 text-ink">
                  {t("workspaceClaimLegacyHint")}
                </p>
              ) : null}

              {error ? (
                <p role="alert" className="rounded-studio bg-coral/14 p-4 text-sm font-black leading-6 text-[#b62f17]">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={
                  busy ||
                  !acknowledged ||
                  !isValidWorkspaceCode(workspaceCode) ||
                  (workspaceMode === "recover-empty" && !emptyRecoveryAcknowledged)
                }
              >
                {busy
                  ? t("saving")
                  : workspaceMode === "recover-empty"
                    ? t("workspaceKeyRecoverEmptyButton")
                    : t("registerButton")}
                <ArrowRight size={19} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="w-full"
                onClick={() => router.push("/login")}
              >
                <ArrowLeft size={19} />
                {t("registerBack")}
              </Button>
            </form>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Card tone="dark" className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <ShieldCheck size={22} className="text-limepop" />
                <h3 className="text-xl font-black">
                  {workspaceMode === "create"
                    ? t("workspaceKeyOnlyOnce")
                    : workspaceMode === "join"
                      ? t("workspaceKeyTitle")
                      : t("workspaceKeyRecoverEmptyWarningTitle")}
                </h3>
              </div>
              <p className="text-sm font-bold leading-6 text-white/70">
                {workspaceMode === "create"
                  ? t("workspaceKeyWarningBody")
                  : workspaceMode === "join"
                    ? t("workspaceKeyJoinHelp")
                    : t("workspaceKeyRecoverEmptyWarningBody")}
              </p>
            </Card>

            <Card tone="aqua" className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <KeyRound size={22} />
                <h3 className="text-xl font-black">{t("workspaceKeyTitle")}</h3>
              </div>
              <p className="text-sm font-bold leading-6 text-ink/70">{t("workspaceBackupEncryptedHint")}</p>
            </Card>
          </div>
          <SiteFooter className="pt-2 xl:max-w-none xl:px-0" />
        </section>
      </div>
    </main>
  );
}
