"use client";

/**
 * Tracks editors holding unsaved drafts so background cloud pulls never
 * replace the workspace (or reload the page) underneath them.
 */

const unsaved = new Set<string>();

export const registerUnsavedWork = (key: string) => {
  unsaved.add(key);
  return () => {
    unsaved.delete(key);
  };
};

/** True while any registered draft is dirty or any modal/dialog is open. */
export const hasUnsavedWork = () => {
  if (unsaved.size > 0) {
    return true;
  }
  if (typeof document === "undefined") {
    return false;
  }
  return Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], .fixed.inset-0 form'));
};
