"use client";

import { useEffect } from "react";

/**
 * Freezes every decorative background animation while the tab is hidden by
 * toggling [data-motion-hidden] on the document root (see globals.css). A
 * paused animation is rasterized once and then costs nothing, so a
 * backgrounded tab stops burning CPU/GPU on the jelly field and pixel scenes.
 */
export function BackgroundMotionController() {
  useEffect(() => {
    const root = document.documentElement;

    const syncHidden = () => {
      root.toggleAttribute("data-motion-hidden", document.hidden);
    };

    syncHidden();
    document.addEventListener("visibilitychange", syncHidden);

    return () => {
      document.removeEventListener("visibilitychange", syncHidden);
      root.removeAttribute("data-motion-hidden");
    };
  }, []);

  return null;
}
