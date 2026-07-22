"use client";

import { useEffect } from "react";

// Freeze decorative background motion after this long without any pointer,
// keyboard, wheel, or scroll activity. Any input resumes it instantly.
const IDLE_AFTER_MS = 4000;

/**
 * Global power guard for the decorative background motion (jelly field + pixel
 * scenes). It freezes them — via [data-motion-hidden] / [data-motion-idle] on
 * the document root, see globals.css — in two situations where nobody is
 * actively watching:
 *
 *  - the tab/PWA window is hidden, and
 *  - the user has been idle (no input) for a few seconds.
 *
 * A paused animation rasterizes once and then costs nothing, so both cases drop
 * the tab's CPU/GPU to idle. This composes with SceneRoot's per-scene
 * top-edge pause: any one of the three conditions pauses, none of them fight.
 */
export function BackgroundMotionController() {
  useEffect(() => {
    const root = document.documentElement;

    // --- Pause while the tab / PWA window is hidden. ---
    const syncHidden = () => {
      root.toggleAttribute("data-motion-hidden", document.hidden);
    };

    // --- Pause after a spell of no user activity. ---
    let lastActivity = performance.now();
    let idleTimer = 0;

    const checkIdle = () => {
      const elapsed = performance.now() - lastActivity;
      if (elapsed >= IDLE_AFTER_MS) {
        root.toggleAttribute("data-motion-idle", true);
        idleTimer = 0; // re-armed by the next activity
      } else {
        idleTimer = window.setTimeout(checkIdle, IDLE_AFTER_MS - elapsed);
      }
    };

    const markActive = () => {
      lastActivity = performance.now();
      if (root.hasAttribute("data-motion-idle")) {
        root.removeAttribute("data-motion-idle");
      }
      if (!idleTimer) {
        idleTimer = window.setTimeout(checkIdle, IDLE_AFTER_MS);
      }
    };

    const onVisibility = () => {
      syncHidden();
      if (!document.hidden) {
        markActive(); // returning to the window counts as activity
      }
    };

    // `scroll` is captured so scrolling inside an inner container still counts.
    const activityEvents: ReadonlyArray<[keyof WindowEventMap, boolean]> = [
      ["pointerdown", false],
      ["pointermove", false],
      ["wheel", false],
      ["keydown", false],
      ["touchstart", false],
      ["scroll", true],
    ];

    syncHidden();
    markActive();
    for (const [type, capture] of activityEvents) {
      window.addEventListener(type, markActive, { passive: true, capture });
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const [type, capture] of activityEvents) {
        window.removeEventListener(type, markActive, { capture });
      }
      if (idleTimer) {
        window.clearTimeout(idleTimer);
      }
      root.removeAttribute("data-motion-hidden");
      root.removeAttribute("data-motion-idle");
    };
  }, []);

  return null;
}
