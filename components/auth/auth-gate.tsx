"use client";

import { LoginPage } from "@/components/auth/login-page";
import { useAuth } from "@/components/providers/app-providers";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isReady, user } = useAuth();

  if (!isReady) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="size-14 animate-pulse rounded-full bg-limepop shadow-soft" />
      </main>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return children;
}
