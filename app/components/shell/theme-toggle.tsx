"use client";

import { useSyncExternalStore } from "react";

/**
 * The `dark` class on <html> is the source of truth — it is set by the inline
 * script in the layout before first paint, so reading it (rather than mirroring
 * it into state) is what keeps the button honest on a reload.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

/**
 * `startViewTransition` is not in every TypeScript DOM lib yet, and not in every
 * browser — both of which the optional call below handles.
 */
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

export function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    // The server has no DOM; light is the pre-hydration assumption.
    () => false,
  );

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    const next = !dark;

    const apply = () => {
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("theme", next ? "dark" : "light");
      } catch {
        // Private browsing: the theme simply does not persist.
      }
    };

    const doc = document as ViewTransitionDocument;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Firefox has no View Transitions, and nobody who asked for less motion
    // wants a full-page wipe. Both get the instant swap.
    if (!doc.startViewTransition || reduced) {
      apply();
      return;
    }

    // The new theme is revealed as a circle growing out of this button, so the
    // change reads as coming from the thing that was pressed. The radius has to
    // reach the furthest corner, or the wipe stops short of it.
    const box = event.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const root = document.documentElement;
    root.style.setProperty("--theme-x", `${x}px`);
    root.style.setProperty("--theme-y", `${y}px`);
    root.style.setProperty("--theme-r", `${radius}px`);

    doc.startViewTransition(apply);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white text-gray-500 transition-[background-color,color,transform] duration-200 hover:bg-gray-50 hover:text-gray-700 active:scale-95 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    >
      {/* Keyed so React swaps the element rather than patching it, which is what
          lets the incoming glyph run its own spin-in. */}
      <span key={dark ? "sun" : "moon"} className="animate-draw-in flex">
        {dark ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="4.2"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M12 2.8v1.8M12 19.4v1.8M21.2 12h-1.8M4.6 12H2.8M18.5 5.5l-1.3 1.3M6.8 17.2l-1.3 1.3M18.5 18.5l-1.3-1.3M6.8 6.8L5.5 5.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M20.5 14.4A8.6 8.6 0 019.6 3.5a8.6 8.6 0 1010.9 10.9z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </button>
  );
}
