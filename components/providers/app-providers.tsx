"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CostDisplayCurrencyProvider } from "@/components/costs/use-cost-display-currency";
import { JellyInteractions } from "@/components/providers/jelly-interactions";
import { authApi } from "@/lib/api";
import type { LocalAuthUser, RegisterPayload, RegisterResult } from "@/lib/api/auth";
import { Language, TranslationKey, languageLocales, languages, translations } from "@/lib/i18n/translations";

type AuthContextValue = {
  user: LocalAuthUser | null;
  isReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
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
    const storedLanguage = window.localStorage.getItem(languageStorageKey);

    if (languages.some((item) => item === storedLanguage)) {
      setLanguageState(storedLanguage as Language);
    }

    setIsReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = languageLocales[language];
  }, [language]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(languageStorageKey, nextLanguage);
  }, []);

  const authValue = useMemo<AuthContextValue>(
    () => ({
      user,
      isReady,
      signIn: async (email: string, password: string) => {
        const { user: nextUser } = await authApi.login({ email, password });

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
      t: (key: TranslationKey) => translations[language][key]
    }),
    [language, setLanguage]
  );

  return (
    <LanguageContext.Provider value={languageValue}>
      <AuthContext.Provider value={authValue}>
        <CostDisplayCurrencyProvider>
          <JellyInteractions />
          {children}
        </CostDisplayCurrencyProvider>
      </AuthContext.Provider>
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
