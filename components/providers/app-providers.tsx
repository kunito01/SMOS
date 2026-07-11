"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authApi } from "@/lib/api";
import { Language, TranslationKey, languageLocales, languages, translations } from "@/lib/i18n/translations";

type MockUser = {
  id: string;
  name: string;
  email: string;
};

type AuthContextValue = {
  user: MockUser | null;
  isReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
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

const authStorageKey = "studio-map-os.mock-user";
const languageStorageKey = "studio-map-os.language";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const storedUser = window.localStorage.getItem(authStorageKey);
    const storedLanguage = window.localStorage.getItem(languageStorageKey);

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser) as MockUser);
      } catch {
        window.localStorage.removeItem(authStorageKey);
      }
    }

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
        window.localStorage.setItem(authStorageKey, JSON.stringify(nextUser));
      },
      signUp: async (name: string, email: string, password: string) => {
        const { user: nextUser } = await authApi.register({ name, email, password });
        await authApi.handshake(nextUser.id);

        setUser(nextUser);
        window.localStorage.setItem(authStorageKey, JSON.stringify(nextUser));
      },
      signOut: async () => {
        await authApi.logout();
        setUser(null);
        window.localStorage.removeItem(authStorageKey);
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
      <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
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
