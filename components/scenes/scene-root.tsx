"use client";

import { useEffect, useRef, type ReactNode } from "react";

type SceneRootProps = {
  className: string;
  children: ReactNode;
};

/**
 * Decorative background scene wrapper. It animates only while the scene's top
 * edge is inside the viewport; the moment that edge scrolls out of view the
 * scene pauses (via the [data-motion-paused] CSS rule) and stops costing
 * frames. Keying on the top edge — rather than a visible-area ratio — keeps the
 * rule independent of the scene's height, so a banner taller than the viewport
 * still animates while you are looking at its top. Tab-hidden pausing is
 * handled globally by BackgroundMotionController.
 */
export function SceneRoot({ className, children }: SceneRootProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      return;
    }

    // A 1px transparent sentinel pinned to the scene's top edge. Watching the
    // sentinel (instead of the whole scene) turns "is the top edge on screen"
    // into a simple intersecting/not test that fires reliably even when the
    // scene is far taller than the viewport.
    const sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:1px;pointer-events:none;";
    element.appendChild(sentinel);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          element.dataset.motionPaused = entry.isIntersecting ? "false" : "true";
        }
      },
      { threshold: 0 }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      sentinel.remove();
    };
  }, []);

  return (
    <div ref={ref} className={className} aria-hidden="true">
      {children}
    </div>
  );
}
