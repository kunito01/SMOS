"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  Building2,
  CircleDollarSign,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Map,
  PackagePlus,
  Search,
  Share2
} from "lucide-react";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { labelKey: "navDashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "navCompanies", href: "/companies", icon: Building2 },
  { labelKey: "navProjects", href: "/projects", icon: FolderKanban },
  { labelKey: "navCosts", href: "/costs", icon: CircleDollarSign },
  { labelKey: "navLibraries", href: "/libraries", icon: PackagePlus },
  { labelKey: "navShare", href: "/share/studio-share-alpha", icon: Share2 }
] as const;

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const { t } = useI18n();
  const mobileNavRef = useRef<HTMLDivElement | null>(null);
  const [showMobileDock, setShowMobileDock] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  useEffect(() => {
    const mobileNav = mobileNavRef.current;

    if (!mobileNav) {
      return;
    }

    const updateDockVisibility = () => {
      if (window.innerWidth >= 1280) {
        setShowMobileDock(false);
        return;
      }

      const rect = mobileNav.getBoundingClientRect();
      setShowMobileDock(rect.bottom <= 0);
    };

    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              if (window.innerWidth >= 1280) {
                setShowMobileDock(false);
                return;
              }

              setShowMobileDock(!entry.isIntersecting && entry.boundingClientRect.top < 0);
            },
            { threshold: 0 }
          )
        : null;

    observer?.observe(mobileNav);
    updateDockVisibility();
    window.addEventListener("resize", updateDockVisibility);
    window.addEventListener("scroll", updateDockVisibility, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateDockVisibility);
      window.removeEventListener("scroll", updateDockVisibility);
    };
  }, []);

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden p-3 sm:p-5 xl:p-6">
      <div className="jelly-field" aria-hidden="true">
        <span className="jelly-mass jelly-mass-a" />
        <span className="jelly-mass jelly-mass-b" />
        <span className="jelly-mass jelly-mass-c" />
        <span className="jelly-mass jelly-mass-d" />
      </div>
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-1.5rem)] w-full max-w-[1480px] flex-col gap-4 xl:min-h-[calc(100vh-3rem)] xl:flex-row">
        <div className="hidden w-24 shrink-0 xl:block" aria-hidden="true" />
        <aside className="studio-side-rail-fixed fixed top-6 z-50 hidden h-[calc(100vh-3rem)] w-24 rounded-studio-xl bg-white/[0.58] px-4 py-5 shadow-soft ring-1 ring-white/[0.42] backdrop-blur-2xl xl:block">
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-3">
            <nav className="flex flex-col gap-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.labelKey}
                    href={item.href}
                    prefetch={false}
                    aria-label={t(item.labelKey)}
                    className={cn(
                      "grid size-[3.25rem] place-items-center rounded-full transition duration-200",
                      active ? "bg-limepop text-ink shadow-soft" : "bg-cloud/70 text-muted hover:bg-aqua hover:text-ink"
                    )}
                  >
                    <Icon size={22} strokeWidth={2.2} />
                  </Link>
                );
              })}
            </nav>
            <Button variant="icon" size="icon" aria-label={t("logout")} onClick={handleSignOut}>
              <LogOut size={20} strokeWidth={2.2} />
            </Button>
          </div>
        </aside>

        <main className="relative z-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-studio-xl bg-white/[0.34] shadow-soft ring-1 ring-white/[0.34] backdrop-blur-xl">
          <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 xl:px-8">
            <Link href="/dashboard" prefetch={false} className="flex min-w-0 items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-white">
                <Map size={22} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 text-lg font-black leading-none">Studio Map OS</span>
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <LanguageToggle compact variant="dropdown" className="hidden sm:inline-flex" />
              <Button variant="ghost" size="icon" aria-label={t("search")}>
                <Search size={20} />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t("notifications")}>
                <Bell size={20} />
              </Button>
              <Button variant="primary" size="icon" aria-label={t("openMap")}>
                <ArrowUpRight size={20} />
              </Button>
            </div>
          </header>

          <div ref={mobileNavRef} className="studio-scroll flex gap-2 overflow-x-auto px-4 pb-4 sm:px-6 xl:hidden">
            <LanguageToggle compact className="shrink-0 sm:hidden" />
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.labelKey}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold",
                    active ? "bg-limepop text-ink" : "bg-white text-muted"
                  )}
                >
                  <Icon size={18} />
                  {t(item.labelKey)}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-muted"
            >
              <LogOut size={18} />
              {t("logout")}
            </button>
          </div>

          {children}
        </main>
      </div>
      <div
        aria-hidden={!showMobileDock}
        className={cn(
          "studio-mobile-dock fixed inset-x-0 z-[90] px-3 transition duration-500 ease-out xl:hidden",
          showMobileDock ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0 pointer-events-none"
        )}
      >
        <nav className="mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-1.5 rounded-[2rem] bg-white/[0.56] p-2 shadow-[0_24px_70px_rgba(25,55,60,0.24)] ring-1 ring-white/[0.62] backdrop-blur-2xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.labelKey}
                href={item.href}
                prefetch={false}
                aria-label={t(item.labelKey)}
                tabIndex={showMobileDock ? undefined : -1}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-2xl transition duration-200 active:scale-95",
                  active ? "scale-105 bg-limepop text-ink shadow-soft" : "bg-white/[0.34] text-ink/70 hover:bg-white/70 hover:text-ink"
                )}
              >
                <Icon size={20} strokeWidth={2.25} />
              </Link>
            );
          })}
          <span className="mx-1 h-8 w-px shrink-0 bg-ink/10" aria-hidden="true" />
          <button
            type="button"
            onClick={handleSignOut}
            aria-label={t("logout")}
            tabIndex={showMobileDock ? undefined : -1}
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.34] text-ink/70 transition duration-200 hover:bg-coral hover:text-white active:scale-95"
          >
            <LogOut size={20} strokeWidth={2.25} />
          </button>
        </nav>
      </div>
    </div>
  );
}
