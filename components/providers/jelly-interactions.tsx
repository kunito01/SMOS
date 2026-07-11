"use client";

import { useEffect } from "react";

const controlSelector =
  'button:not(:disabled), a[href], [role="button"], [data-jelly-control="true"]';
const cardSelector = '[data-jelly-card="true"]';
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const finePointerQuery = "(hover: hover) and (pointer: fine)";

const quadOut = "cubic-bezier(0.333, 0.667, 0.667, 1)";
const backOut = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const cardMotionSpeedMultiplier = 1.4;
const cardDuration = (duration: number) => Math.round(duration / cardMotionSpeedMultiplier);

type JellyTarget = {
  cancelled: boolean;
  direction: -1 | 1;
  element: HTMLElement;
  kind: "card" | "control";
  startX: number;
  startY: number;
};

const isElement = (target: EventTarget | null): target is Element =>
  target instanceof Element;

const getControl = (target: EventTarget | null) => {
  if (!isElement(target)) {
    return null;
  }

  const control = target.closest<HTMLElement>(controlSelector);

  if (!control || control.getAttribute("aria-disabled") === "true") {
    return null;
  }

  return control;
};

const getInteractiveCard = (target: EventTarget | null) => {
  if (!isElement(target)) {
    return null;
  }

  const control = getControl(target);
  const card =
    target.closest<HTMLElement>(cardSelector) ??
    control?.querySelector<HTMLElement>(cardSelector) ??
    null;

  if (!card) {
    return null;
  }

  const interactiveAncestor = card.closest<HTMLElement>(controlSelector);
  const explicitlyInteractive = card.dataset.jellyInteractive === "true";

  return interactiveAncestor || explicitlyInteractive ? card : null;
};

const getDirection = (element: HTMLElement, clientX?: number): -1 | 1 => {
  if (typeof clientX !== "number") {
    return 1;
  }

  const bounds = element.getBoundingClientRect();
  return clientX < bounds.left + bounds.width / 2 ? -1 : 1;
};

const readScale = (element: HTMLElement) => {
  const value = window.getComputedStyle(element).scale;
  return !value || value === "none" ? "1 1" : value;
};

const readRotation = (element: HTMLElement) => {
  const value = window.getComputedStyle(element).rotate;
  return !value || value === "none" ? "0deg" : value;
};

export function JellyInteractions() {
  useEffect(() => {
    const motionPreference = window.matchMedia(reducedMotionQuery);
    const finePointer = window.matchMedia(finePointerQuery);
    const pointerTargets = new Map<number, JellyTarget>();
    const keyboardTargets = new Map<HTMLElement, JellyTarget>();
    const runningAnimations = new Map<HTMLElement, Set<Animation>>();
    let reduceMotion = motionPreference.matches;
    let tiltFrame = 0;
    let pendingTilt: { card: HTMLElement; x: number; y: number } | null = null;

    const removeActiveClass = (element: HTMLElement) => {
      if (!runningAnimations.get(element)?.size) {
        element.classList.remove("smos-game-motion-active");
      }
    };

    const cancelAnimations = (element: HTMLElement) => {
      const animations = runningAnimations.get(element);

      animations?.forEach((animation) => animation.cancel());
      runningAnimations.delete(element);
      element.classList.remove("smos-game-motion-active");
    };

    const cancelTargetAnimations = (element: HTMLElement) => {
      cancelAnimations(element);
      element.querySelectorAll<HTMLElement>("svg").forEach(cancelAnimations);
    };

    const animate = (
      element: HTMLElement,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
      persist = false
    ) => {
      element.classList.add("smos-game-motion-active");
      const animation = element.animate(keyframes, options);
      const animations = runningAnimations.get(element) ?? new Set<Animation>();

      animations.add(animation);
      runningAnimations.set(element, animations);

      animation.finished
        .then(() => {
          if (persist) {
            return;
          }

          animation.cancel();
          animations.delete(animation);

          if (!animations.size) {
            runningAnimations.delete(element);
          }

          removeActiveClass(element);
        })
        .catch(() => {
          animations.delete(animation);

          if (!animations.size) {
            runningAnimations.delete(element);
          }
        });

      return animation;
    };

    const playIconTurn = (control: HTMLElement, direction: -1 | 1) => {
      control.querySelectorAll<HTMLElement>("svg").forEach((icon) => {
        const from = readRotation(icon);
        cancelAnimations(icon);
        animate(
          icon,
          [
            { rotate: from, offset: 0, easing: quadOut },
            { rotate: `${direction * 14}deg`, offset: 0.32, easing: quadOut },
            { rotate: `${direction * -6}deg`, offset: 0.62, easing: backOut },
            { rotate: "0deg", offset: 1 }
          ],
          { duration: 300, fill: "forwards" }
        );
      });
    };

    const playControlPress = (control: HTMLElement) => {
      const from = readScale(control);
      cancelTargetAnimations(control);
      animate(
        control,
        [
          { scale: from, easing: quadOut },
          { scale: "1.13 0.84" }
        ],
        { duration: 70, fill: "forwards" },
        true
      );
    };

    const playControlRelease = (control: HTMLElement, direction: -1 | 1) => {
      const from = readScale(control);
      cancelTargetAnimations(control);
      animate(
        control,
        [
          { scale: from, offset: 0, easing: quadOut },
          { scale: "0.96 1.13", offset: 0.3636, easing: backOut },
          { scale: "1 1", offset: 1 }
        ],
        { duration: 220, fill: "forwards" }
      );
      playIconTurn(control, direction);
    };

    const playControlReset = (control: HTMLElement) => {
      const from = readScale(control);
      cancelTargetAnimations(control);
      animate(
        control,
        [
          { scale: from, easing: backOut },
          { scale: "1 1" }
        ],
        { duration: 120, fill: "forwards" }
      );
    };

    const cardHoverScale = (card: HTMLElement) => {
      const interactiveAncestor = card.closest<HTMLElement>(controlSelector);
      const isFocused = Boolean(interactiveAncestor?.matches(":focus-visible")) || card.matches(":focus-visible");
      return (finePointer.matches && card.matches(":hover")) || isFocused ? "1.0175" : "1";
    };

    const playCardArrival = (card: HTMLElement, direction: -1 | 1) => {
      const fromScale = readScale(card);
      const fromRotation = readRotation(card);
      cancelTargetAnimations(card);

      animate(
        card,
        [
          { scale: fromScale, offset: 0, easing: quadOut },
          { scale: "1.06 0.958", offset: 0.2105, easing: quadOut },
          { scale: "0.979 1.033", offset: 0.4737, easing: backOut },
          { scale: "1.0175 1.0175", offset: 1 }
        ],
        { duration: cardDuration(380), fill: "forwards" }
      );
      animate(
        card,
        [
          { rotate: fromRotation, offset: 0, easing: quadOut },
          { rotate: `${direction * -1.26}deg`, offset: 0.2051, easing: quadOut },
          { rotate: `${direction * 0.58}deg`, offset: 0.4872, easing: backOut },
          { rotate: "0deg", offset: 1 }
        ],
        { duration: cardDuration(390), fill: "forwards" }
      );
    };

    const playCardPress = (card: HTMLElement, direction: -1 | 1) => {
      const fromScale = readScale(card);
      const fromRotation = readRotation(card);
      cancelTargetAnimations(card);
      animate(
        card,
        [
          { scale: fromScale, easing: quadOut },
          { scale: "1.06 0.958" }
        ],
        { duration: cardDuration(80), fill: "forwards" },
        true
      );
      animate(
        card,
        [
          { rotate: fromRotation, easing: quadOut },
          { rotate: `${direction * -1.26}deg` }
        ],
        { duration: cardDuration(80), fill: "forwards" },
        true
      );
    };

    const playCardRelease = (card: HTMLElement, direction: -1 | 1) => {
      const fromScale = readScale(card);
      const fromRotation = readRotation(card);
      const finalScale = cardHoverScale(card);
      cancelTargetAnimations(card);
      animate(
        card,
        [
          { scale: fromScale, offset: 0, easing: quadOut },
          { scale: "0.979 1.033", offset: 0.3333, easing: backOut },
          { scale: `${finalScale} ${finalScale}`, offset: 1 }
        ],
        { duration: cardDuration(300), fill: "forwards" }
      );
      animate(
        card,
        [
          { rotate: fromRotation, offset: 0, easing: quadOut },
          { rotate: `${direction * 0.58}deg`, offset: 0.3548, easing: backOut },
          { rotate: "0deg", offset: 1 }
        ],
        { duration: cardDuration(310), fill: "forwards" }
      );
    };

    const resetCardTilt = (card: HTMLElement) => {
      card.style.removeProperty("--smos-card-tilt-x");
      card.style.removeProperty("--smos-card-tilt-y");
      card.style.removeProperty("--smos-card-turn");
    };

    const playCardReset = (card: HTMLElement) => {
      const fromScale = readScale(card);
      const fromRotation = readRotation(card);
      cancelTargetAnimations(card);
      resetCardTilt(card);
      animate(
        card,
        [
          { scale: fromScale, easing: backOut },
          { scale: "1 1" }
        ],
        { duration: cardDuration(180), fill: "forwards" }
      );
      animate(
        card,
        [
          { rotate: fromRotation, easing: backOut },
          { rotate: "0deg" }
        ],
        { duration: cardDuration(200), fill: "forwards" }
      );
    };

    const finishTarget = (target: JellyTarget, released = true) => {
      if (target.cancelled || reduceMotion) {
        return;
      }

      if (target.kind === "card") {
        if (released) {
          playCardRelease(target.element, target.direction);
        } else {
          playCardReset(target.element);
        }
      } else if (released) {
        playControlRelease(target.element, target.direction);
      } else {
        playControlReset(target.element);
      }
    };

    const cancelDraggedTarget = (target: JellyTarget) => {
      if (target.cancelled) {
        return;
      }

      target.cancelled = true;

      if (target.kind === "card") {
        playCardReset(target.element);
      } else {
        playControlReset(target.element);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (reduceMotion || (event.pointerType === "mouse" && event.button !== 0)) {
        return;
      }

      const card = getInteractiveCard(event.target);
      const control = card ? null : getControl(event.target);
      const element = card ?? control;

      if (!element) {
        return;
      }

      const direction = getDirection(element, event.clientX);
      const target: JellyTarget = {
        cancelled: false,
        direction,
        element,
        kind: card ? "card" : "control",
        startX: event.clientX,
        startY: event.clientY
      };

      pointerTargets.set(event.pointerId, target);

      if (target.kind === "card") {
        playCardPress(element, direction);
      } else {
        playControlPress(element);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const activeTarget = pointerTargets.get(event.pointerId);

      if (activeTarget && Math.hypot(event.clientX - activeTarget.startX, event.clientY - activeTarget.startY) > 8) {
        cancelDraggedTarget(activeTarget);
      }

      if (reduceMotion || (event.pointerType !== "mouse" && event.pointerType !== "pen")) {
        return;
      }

      const card = getInteractiveCard(event.target);

      if (!card) {
        return;
      }

      pendingTilt = { card, x: event.clientX, y: event.clientY };

      if (tiltFrame) {
        return;
      }

      tiltFrame = window.requestAnimationFrame(() => {
        tiltFrame = 0;

        if (!pendingTilt) {
          return;
        }

        const { card: pendingCard, x, y } = pendingTilt;
        const bounds = pendingCard.getBoundingClientRect();
        const normalizedX = Math.max(-1, Math.min(1, (x - bounds.left) / bounds.width * 2 - 1));
        const normalizedY = Math.max(-1, Math.min(1, (y - bounds.top) / bounds.height * 2 - 1));

        pendingCard.style.setProperty("--smos-card-tilt-x", `${normalizedY * -0.9}deg`);
        pendingCard.style.setProperty("--smos-card-tilt-y", `${normalizedX * 1.3}deg`);
        pendingCard.style.setProperty("--smos-card-turn", `${normalizedX * 0.325}deg`);
        pendingTilt = null;
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const target = pointerTargets.get(event.pointerId);

      if (!target) {
        return;
      }

      pointerTargets.delete(event.pointerId);
      finishTarget(target);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const target = pointerTargets.get(event.pointerId);

      if (!target) {
        return;
      }

      pointerTargets.delete(event.pointerId);
      finishTarget(target, false);
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (reduceMotion || (event.pointerType !== "mouse" && event.pointerType !== "pen")) {
        return;
      }

      const card = getInteractiveCard(event.target);

      if (!card || (isElement(event.relatedTarget) && card.contains(event.relatedTarget))) {
        return;
      }

      playCardArrival(card, getDirection(card, event.clientX));
    };

    const handlePointerOut = (event: PointerEvent) => {
      const card = getInteractiveCard(event.target);

      if (!card || (isElement(event.relatedTarget) && card.contains(event.relatedTarget))) {
        return;
      }

      pendingTilt = pendingTilt?.card === card ? null : pendingTilt;
      playCardReset(card);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (reduceMotion || event.repeat || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }

      const card = getInteractiveCard(event.target);
      const control = card ? null : getControl(event.target);
      const element = card ?? control;

      if (!element || keyboardTargets.has(element)) {
        return;
      }

      const target: JellyTarget = {
        cancelled: false,
        direction: 1,
        element,
        kind: card ? "card" : "control",
        startX: 0,
        startY: 0
      };

      keyboardTargets.set(element, target);

      if (target.kind === "card") {
        playCardPress(element, 1);
      } else {
        playControlPress(element);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      const card = getInteractiveCard(event.target);
      const control = card ? null : getControl(event.target);
      const element = card ?? control;

      if (!element) {
        return;
      }

      const target = keyboardTargets.get(element);

      if (!target) {
        return;
      }

      keyboardTargets.delete(element);
      finishTarget(target);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (reduceMotion) {
        return;
      }

      const card = getInteractiveCard(event.target);

      if (card) {
        playCardArrival(card, 1);
      }
    };

    const handleFocusOut = (event: FocusEvent) => {
      const card = getInteractiveCard(event.target);

      if (card) {
        playCardReset(card);
      }
    };

    const resetAll = () => {
      pointerTargets.forEach((target) => finishTarget(target, false));
      keyboardTargets.forEach((target) => finishTarget(target, false));
      pointerTargets.clear();
      keyboardTargets.clear();
    };

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reduceMotion = event.matches;

      if (!reduceMotion) {
        return;
      }

      runningAnimations.forEach((_, element) => cancelAnimations(element));
      document.querySelectorAll<HTMLElement>(cardSelector).forEach(resetCardTilt);
      pointerTargets.clear();
      keyboardTargets.clear();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handlePointerCancel, true);
    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("keyup", handleKeyUp, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    window.addEventListener("blur", resetAll);
    motionPreference.addEventListener("change", handleMotionPreferenceChange);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerCancel, true);
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("keyup", handleKeyUp, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      window.removeEventListener("blur", resetAll);
      motionPreference.removeEventListener("change", handleMotionPreferenceChange);

      if (tiltFrame) {
        window.cancelAnimationFrame(tiltFrame);
      }

      runningAnimations.forEach((_, element) => cancelAnimations(element));
    };
  }, []);

  return null;
}
