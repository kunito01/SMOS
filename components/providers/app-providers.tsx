"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CostDisplayCurrencyProvider } from "@/components/costs/use-cost-display-currency";
import { CloudKitAuthProvider } from "@/components/providers/cloudkit-auth-provider";
import { BackgroundMotionController } from "@/components/providers/background-motion-controller";
import { JellyInteractions } from "@/components/providers/jelly-interactions";
import { WorkspaceConflictGuardDialog } from "@/components/storage/workspace-conflict-guard-dialog";
import { authApi } from "@/lib/api";
import type {
  AppleAccountLoginResolution,
  AppleAccountRecoveryPayload,
  AppleAccountSetupPayload,
  LocalAuthUser,
  RegisterPayload,
  RegisterResult
} from "@/lib/api/auth";
import type { CloudKitUserIdentity } from "@/lib/storage/cloudkit/cloudkit-client";
import { keepNumericWordPairsTogether } from "@/lib/i18n/non-breaking";
import {
  Language,
  TranslationKey,
  languageDocumentTags,
  languages,
  translations
} from "@/lib/i18n/translations";

type AuthContextValue = {
  user: LocalAuthUser | null;
  isReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  inspectAppleAccount: (identity: CloudKitUserIdentity) => Promise<AppleAccountLoginResolution>;
  provisionAppleAccount: (payload: AppleAccountSetupPayload) => Promise<RegisterResult>;
  recoverAppleAccount: (payload: AppleAccountRecoveryPayload) => Promise<{ token: string; user: LocalAuthUser }>;
  unlockAppleAccountOffline: () => Promise<{ user: LocalAuthUser } | null>;
  commitAppleAccountUser: (user: LocalAuthUser) => void;
  signInDevelopmentTestAccount: () => Promise<void>;
  signUp: (payload: RegisterPayload) => Promise<RegisterResult>;
  signOut: () => Promise<void>;
};

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey) => string;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const LanguageContext = createContext<LanguageContextValue | null>(null);

const languageStorageKey = "studio-map-os.language";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalAuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    let isCancelled = false;

    const restoreCurrentSession = async () => {
      try {
        const storedLanguage = window.localStorage.getItem(languageStorageKey);

        if (!isCancelled && languages.some((item) => item === storedLanguage)) {
          setLanguageState(storedLanguage as Language);
        }

        const currentUser = await authApi.getCurrentUser();
        if (!isCancelled) {
          setUser(currentUser);
        }
      } catch {
        // The login screen remains available if browser storage cannot be read.
      } finally {
        if (!isCancelled) {
          setIsReady(true);
        }
      }
    };

    void restoreCurrentSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = languageDocumentTags[language];
  }, [language]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(languageStorageKey, nextLanguage);
  }, []);

  const handleCloudKitSignedOut = useCallback(async () => {
    if (await authApi.logoutAppleSession()) {
      setUser(null);
    }
  }, []);

  const authValue = useMemo<AuthContextValue>(
    () => ({
      user,
      isReady,
      signIn: async (email: string, password: string) => {
        const { user: nextUser } = await authApi.login({ email, password });

        setUser(nextUser);
      },
      inspectAppleAccount: async (identity: CloudKitUserIdentity) => {
        return authApi.inspectAppleAccount(identity);
      },
      provisionAppleAccount: async (payload: AppleAccountSetupPayload) => {
        return authApi.provisionAppleAccount(payload);
      },
      recoverAppleAccount: async (payload: AppleAccountRecoveryPayload) => {
        return authApi.recoverAppleAccount(payload);
      },
      unlockAppleAccountOffline: async () => {
        return authApi.unlockAppleAccountOffline();
      },
      commitAppleAccountUser: (nextUser: LocalAuthUser) => setUser(nextUser),
      signInDevelopmentTestAccount: async () => {
        const { user: nextUser } = await authApi.loginDevelopmentTestAccount();

        setUser(nextUser);
      },
      signUp: async (payload: RegisterPayload) => {
        const result = await authApi.register(payload);
        const nextUser = result.user;
        await authApi.handshake(nextUser.id);

        if (result.restoredLanguage) {
          setLanguageState(result.restoredLanguage);
        }
        setUser(nextUser);
        return result;
      },
      signOut: async () => {
        await authApi.logout();
        setUser(null);
      }
    }),
    [isReady, user]
  );

  const languageValue = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage: () => {
        const currentIndex = languages.indexOf(language);
        const nextLanguage = languages[(currentIndex + 1) % languages.length];
        setLanguage(nextLanguage);
      },
      t: (key: TranslationKey) => keepNumericWordPairsTogether(translations[language][key])
    }),
    [language, setLanguage]
  );

  return (
    <LanguageContext.Provider value={languageValue}>
      <CloudKitAuthProvider onSignedOut={handleCloudKitSignedOut}>
        <AuthContext.Provider value={authValue}>
          <CostDisplayCurrencyProvider>
            <JellyInteractions />
            <BackgroundMotionController />
            <WorkspaceConflictGuardDialog />
            {children}
          </CostDisplayCurrencyProvider>
        </AuthContext.Provider>
      </CloudKitAuthProvider>
    </LanguageContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AppProviders");
  }

  return context;
}

export function useI18n() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useI18n must be used inside AppProviders");
  }

  return context;
}
