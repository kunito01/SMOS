"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  Bell,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Fingerprint,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  PackagePlus,
  Undo2,
  X
} from "lucide-react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { SiteFooter } from "@/components/layout/site-footer";
import { useAuth, useI18n } from "@/components/providers/app-providers";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/modal-portal";
import { projectsApi } from "@/lib/api";
import { formatDemoEntityName, projectNameKeys, taskTitleKeys, translateDomainLabel } from "@/lib/i18n/domain-labels";
import { formatLocalizedDate } from "@/lib/i18n/formatters";
import { projectPath } from "@/lib/utils/app-routes";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { labelKey: "navDashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "navCompanies", href: "/companies", icon: Building2 },
  { labelKey: "navProjects", href: "/projects", icon: FolderKanban },
  { labelKey: "navCosts", href: "/costs", icon: CircleDollarSign },
  { labelKey: "navLibraries", href: "/libraries", icon: PackagePlus },
  { labelKey: "navArchive", href: "/archive", icon: Archive }
] as const;

const responsiveHeaderControlClass =
  "max-[482px]:size-10 max-[482px]:[&_svg]:size-[18px] max-[400px]:size-9 max-[400px]:[&_svg]:size-4 max-[370px]:size-[30px] max-[370px]:[&_svg]:size-3.5";

type AppShellProps = {
  beforeNavigate?: () => boolean;
  children: React.ReactNode;
};

type DueTodayItem = {
  completed: boolean;
  dueDate: string;
  projectId: string;
  projectName: string;
  reminderId: string;
  taskId: string;
  taskTitle: string;
};

const dismissedDueTodayStorageKey = (workspaceId: string) =>
  `studio-map-os.workspace.${workspaceId}.dismissed-due-today-items`;

const createDueTodayReminderId = (projectId: string, taskId: string, dueDate: string) =>
  `${projectId}:${taskId}:${dueDate}`;

const readDismissedDueTodayItems = (workspaceId: string) => {
  try {
    const stored = window.localStorage.getItem(dismissedDueTodayStorageKey(workspaceId));
    const parsed = stored ? (JSON.parse(stored) as unknown) : [];

    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export function AppShell({ beforeNavigate, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut, user } = useAuth();
  const { language, t } = useI18n();
  const mobileNavRef = useRef<HTMLDivElement | null>(null);
  const mobileNavDragRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startScrollLeft: 0,
    startX: 0,
    suppressClick: false
  });
  const [showMobileDock, setShowMobileDock] = useState(false);
  const [dueTodayItems, setDueTodayItems] = useState<DueTodayItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const workspaceId = user?.workspaceId;

  const canNavigate = () => beforeNavigate?.() ?? true;

  const handleLinkNavigate = (event: { preventDefault: () => void }) => {
    if (!canNavigate()) {
      event.preventDefault();
    }
  };

  const handleSignOut = async () => {
    if (!canNavigate()) {
      return;
    }

    await signOut();
    router.replace("/login");
  };

  const handleDueTodayDismiss = (item: DueTodayItem) => {
    if (!workspaceId) {
      return;
    }

    const dismissed = readDismissedDueTodayItems(workspaceId);
    dismissed.add(item.reminderId);
    window.localStorage.setItem(
      dismissedDueTodayStorageKey(workspaceId),
      JSON.stringify([...dismissed])
    );
    setDueTodayItems((current) => current.filter((currentItem) => currentItem.reminderId !== item.reminderId));
  };

  const stopMobileNavDrag = () => {
    if (!mobileNavDragRef.current.active) {
      return;
    }

    const mobileNav = mobileNavRef.current;

    if (mobileNav && mobileNavDragRef.current.pointerId >= 0) {
      try {
        mobileNav.releasePointerCapture(mobileNavDragRef.current.pointerId);
      } catch {
        // Pointer capture may already be released when the browser cancels the gesture.
      }
    }

    const shouldSuppressClick = mobileNavDragRef.current.moved;

    mobileNavDragRef.current.active = false;
    mobileNavDragRef.current.moved = false;
    mobileNavDragRef.current.pointerId = -1;
    mobileNavDragRef.current.suppressClick = shouldSuppressClick;

    if (shouldSuppressClick) {
      window.setTimeout(() => {
        mobileNavDragRef.current.suppressClick = false;
      }, 0);
    }
  };

  const handleMobileNavPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) {
      return;
    }

    const mobileNav = mobileNavRef.current;

    if (!mobileNav || mobileNav.scrollWidth <= mobileNav.clientWidth) {
      return;
    }

    mobileNavDragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startScrollLeft: mobileNav.scrollLeft,
      startX: event.clientX,
      suppressClick: false
    };
  };

  const handleMobileNavPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const mobileNav = mobileNavRef.current;

    if (!mobileNavDragRef.current.active || event.pointerId !== mobileNavDragRef.current.pointerId || !mobileNav) {
      return;
    }

    const deltaX = event.clientX - mobileNavDragRef.current.startX;

    if (Math.abs(deltaX) > 4 && !mobileNavDragRef.current.moved) {
      mobileNavDragRef.current.moved = true;
      mobileNav.setPointerCapture(event.pointerId);
    }

    mobileNav.scrollLeft = mobileNavDragRef.current.startScrollLeft - deltaX;

    if (mobileNavDragRef.current.moved) {
      event.preventDefault();
    }
  };

  const handleMobileNavClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!mobileNavDragRef.current.suppressClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    mobileNavDragRef.current.suppressClick = false;
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

  useEffect(() => {
    let isMounted = true;

    if (!workspaceId) {
      setDueTodayItems([]);
      return () => {
        isMounted = false;
      };
    }
    const activeWorkspaceId = workspaceId;

    async function loadDueTodayItems() {
      try {
        const todayKey = toDateKey(new Date());
        const dismissedItems = readDismissedDueTodayItems(activeWorkspaceId);
        const projects = await projectsApi.listProjects();
        const nextItems = projects.flatMap((project) =>
          project.phases.flatMap((phase) =>
            phase.deliverables.flatMap((deliverable) =>
              deliverable.tasks
                .filter((task) => task.dueDate === todayKey)
                .map((task) => ({
                  completed: task.completed,
                  dueDate: task.dueDate ?? todayKey,
                  projectId: project.id,
                  projectName: project.name,
                  reminderId: createDueTodayReminderId(project.id, task.id, task.dueDate ?? todayKey),
                  taskId: task.id,
                  taskTitle: task.title
                }))
                .filter((item) => !dismissedItems.has(item.reminderId))
            )
          )
        );

        if (isMounted) {
          setDueTodayItems(nextItems);
        }
      } catch {
        if (isMounted) {
          setDueTodayItems([]);
        }
      }
    }

    loadDueTodayItems();

    return () => {
      isMounted = false;
    };
  }, [workspaceId]);

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
                    onNavigate={handleLinkNavigate}
                    aria-label={t(item.labelKey)}
                    className={cn(
                      "grid size-[3.25rem] place-items-center rounded-full transition duration-200",
                      active ? "bg-[#ffc700] text-ink shadow-soft" : "bg-cloud/70 text-muted hover:bg-aqua hover:text-ink"
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
          <header className="flex items-center justify-between gap-3 px-4 py-4 max-[482px]:gap-2 max-[370px]:gap-1.5 sm:px-6 xl:px-8">
            <Link href="/dashboard" prefetch={false} onNavigate={handleLinkNavigate} className="min-w-0">
              <BrandLockup subtitle={t("loginEyebrow")} size="shell" />
            </Link>

            <div className="ml-auto flex items-center gap-2 max-[482px]:gap-1 max-[370px]:gap-[3px]">
              {user ? (
                <div
                  className="hidden min-w-0 items-center gap-2 rounded-full bg-white/62 px-3 py-2 text-ink shadow-sm ring-1 ring-white/60 lg:inline-flex"
                  title={`${t("workspaceIdentity")} · ${user.workspaceFingerprint}`}
                >
                  <Fingerprint size={16} className="shrink-0 text-coral" />
                  <span className="max-w-40 truncate text-[11px] font-black uppercase tracking-[0.08em] text-ink/55">
                    {t("workspaceIdentity")}
                  </span>
                  <strong className="whitespace-nowrap font-mono text-xs tracking-[0.08em]">
                    {user.workspaceFingerprint}
                  </strong>
                </div>
              ) : null}
              <LanguageToggle compact variant="dropdown" />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("notifications")}
                className={cn("relative", responsiveHeaderControlClass)}
                onClick={() => setNotificationsOpen(true)}
              >
                <Bell size={20} />
                {dueTodayItems.length ? (
                  <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-coral ring-2 ring-white max-[482px]:right-2 max-[482px]:top-2 max-[482px]:size-2 max-[370px]:right-1.5 max-[370px]:top-1.5" />
                ) : null}
              </Button>
              <Button
                variant="primary"
                size="icon"
                aria-label={t("goBack")}
                className={responsiveHeaderControlClass}
                onClick={() => {
                  if (canNavigate()) {
                    router.back();
                  }
                }}
              >
                <Undo2 size={24} strokeWidth={1.9} />
              </Button>
            </div>
          </header>

          {user ? (
            <div className="px-4 pb-3 sm:px-6 lg:hidden">
              <div
                className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/62 px-3 py-1.5 text-ink shadow-sm ring-1 ring-white/60"
                title={`${t("workspaceIdentity")} · ${user.workspaceFingerprint}`}
              >
                <Fingerprint size={15} className="shrink-0 text-coral" />
                <span className="hidden truncate text-[10px] font-black uppercase tracking-[0.08em] text-ink/55 min-[390px]:inline">
                  {t("workspaceIdentity")}
                </span>
                <strong className="whitespace-nowrap font-mono text-[11px] tracking-[0.08em]">
                  {user.workspaceFingerprint}
                </strong>
              </div>
            </div>
          ) : null}

          <div
            ref={mobileNavRef}
            className="studio-scroll flex w-full min-w-0 cursor-grab select-none flex-nowrap gap-2 overflow-x-auto overscroll-x-contain px-4 pb-4 touch-pan-x [-webkit-overflow-scrolling:touch] sm:px-6 xl:hidden"
            onClickCapture={handleMobileNavClickCapture}
            onDragStart={(event) => event.preventDefault()}
            onPointerCancel={stopMobileNavDrag}
            onPointerDown={handleMobileNavPointerDown}
            onPointerLeave={stopMobileNavDrag}
            onPointerMove={handleMobileNavPointerMove}
            onPointerUp={stopMobileNavDrag}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.labelKey}
                  href={item.href}
                  prefetch={false}
                  onNavigate={handleLinkNavigate}
                  className={cn(
                    "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold",
                    active ? "bg-[#ffc700] text-ink" : "bg-white text-muted"
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
          <SiteFooter dockSafe />
        </main>
      </div>
      <div
        aria-hidden={!showMobileDock}
        className={cn(
          "studio-mobile-dock fixed inset-x-0 z-[90] px-3 transition duration-500 ease-out xl:hidden",
          showMobileDock ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0 pointer-events-none"
        )}
      >
        <nav className="mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-1.5 rounded-[2rem] bg-white/[0.56] p-2 shadow-[0_24px_70px_rgba(25,55,60,0.24)] ring-1 ring-white/[0.62] backdrop-blur-2xl max-[400px]:gap-1 max-[400px]:rounded-[1.5rem] max-[400px]:p-1 max-[360px]:rounded-[22px] max-[340px]:gap-0.5 max-[340px]:p-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.labelKey}
                href={item.href}
                prefetch={false}
                onNavigate={handleLinkNavigate}
                aria-label={t(item.labelKey)}
                tabIndex={showMobileDock ? undefined : -1}
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-2xl transition duration-200 active:scale-95 max-[400px]:size-10 max-[400px]:rounded-[14px] max-[360px]:size-8 max-[360px]:rounded-[10px]",
                  active ? "scale-105 bg-[#ffc700] text-ink shadow-soft" : "bg-white/[0.34] text-ink/70 hover:bg-white/70 hover:text-ink"
                )}
              >
                <Icon className="max-[400px]:size-[18px] max-[360px]:size-3.5" size={20} strokeWidth={2.25} />
              </Link>
            );
          })}
          <span
            className="mx-1 h-8 w-px shrink-0 bg-ink/10 max-[400px]:mx-0.5 max-[400px]:h-7 max-[360px]:h-6 max-[340px]:mx-0 max-[340px]:h-5"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={handleSignOut}
            aria-label={t("logout")}
            tabIndex={showMobileDock ? undefined : -1}
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.34] text-ink/70 transition duration-200 hover:bg-coral hover:text-white active:scale-95 max-[400px]:size-10 max-[400px]:rounded-[14px] max-[360px]:size-8 max-[360px]:rounded-[10px]"
          >
            <LogOut className="max-[400px]:size-[18px] max-[360px]:size-3.5" size={20} strokeWidth={2.25} />
          </button>
        </nav>
      </div>
      {notificationsOpen ? (
        <ModalPortal>
          <div className="fixed inset-0 z-[120] grid place-items-center bg-ink/32 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-studio-lg bg-[#2c2626] p-5 text-white shadow-[0_28px_80px_rgba(28,35,40,0.24)] ring-1 ring-white/[0.08]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase text-white/45">{t("notifications")}</p>
                  <h2 className="mt-1 text-2xl font-black">{t("dueTodayTitle")}</h2>
                  <p className="mt-2 text-sm font-bold leading-6 text-white/62">{t("dueTodayModalBody")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(false)}
                  aria-label={t("close")}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-cloud text-muted transition hover:bg-[#ffc700] hover:text-ink"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                {dueTodayItems.length ? (
                  dueTodayItems.map((item) => {
                    const projectName = formatDemoEntityName(
                      translateDomainLabel(item.projectName, projectNameKeys, t),
                      item.projectId,
                      "project",
                      t
                    );
                    const taskTitle = translateDomainLabel(item.taskTitle, taskTitleKeys, t) || t("untitledTask");
                    const openProject = () => {
                      if (!canNavigate()) {
                        return;
                      }

                      setNotificationsOpen(false);
                      router.push(projectPath(item.projectId));
                    };

                    return (
                      <div
                        key={item.reminderId}
                        role="link"
                        tabIndex={0}
                        onClick={openProject}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openProject();
                          }
                        }}
                        className="relative cursor-pointer rounded-studio bg-[#e9e5df] py-4 pl-14 pr-4 text-ink transition hover:-translate-y-0.5 hover:bg-[#f2eee8]"
                      >
                        <button
                          type="button"
                          aria-label={`${t("markDone")} ${taskTitle}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDueTodayDismiss(item);
                          }}
                          className="absolute left-3 top-3 grid size-8 place-items-center rounded-full bg-white text-ink shadow-soft ring-1 ring-ink/10 transition hover:bg-[#ffc700]"
                        >
                          <CheckCircle2 size={18} strokeWidth={2.2} />
                        </button>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-lg font-black">{projectName}</h3>
                            <p className="mt-1 text-sm font-bold text-white">{taskTitle}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-[#ffc700] px-3 py-1 text-xs font-black text-ink">
                            {formatLocalizedDate(item.dueDate, language)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-studio bg-[#e9e5df] p-4 text-sm font-bold text-ink">
                    {t("dueTodayEmpty")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
}
