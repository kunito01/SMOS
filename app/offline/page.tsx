import type { Metadata } from "next";
import Link from "next/link";
import { BrandLockup } from "@/components/brand/brand-lockup";

export const metadata: Metadata = {
  title: "Offline · Studio Map OS"
};

export default function OfflinePage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 py-10">
      <div className="jelly-field" aria-hidden="true">
        <span className="jelly-mass jelly-mass-a" />
        <span className="jelly-mass jelly-mass-b" />
        <span className="jelly-mass jelly-mass-c" />
        <span className="jelly-mass jelly-mass-d" />
      </div>

      <section className="relative z-10 w-full max-w-lg rounded-[2rem] border border-white/70 bg-white/85 p-7 shadow-[0_30px_90px_rgba(28,35,40,0.16)] backdrop-blur-2xl sm:p-10">
        <BrandLockup subtitle="LOCAL-FIRST STUDIO SYSTEM" size="hero" />

        <div className="mt-10 inline-flex rounded-full bg-ink px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-limepop">
          Offline mode
        </div>

        <h1 className="mt-5 text-3xl font-black tracking-[-0.04em] text-ink sm:text-4xl">
          当前设备暂时离线
        </h1>
        <p className="mt-4 text-base font-semibold leading-7 text-muted">
          Studio Map OS 无法连接网络。已保存在本机的加密数据不会因此消失；恢复网络后即可继续同步页面资源。
        </p>
        <p className="mt-3 text-sm font-semibold leading-6 text-muted/80">
          You are offline. Your encrypted local data remains on this device.
        </p>

        <Link
          href="/login"
          className="mt-8 flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-ink/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          重新连接 / Try again
        </Link>
      </section>
    </main>
  );
}
