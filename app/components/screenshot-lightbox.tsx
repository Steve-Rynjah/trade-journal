"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Every chart on a trade, opened at the one that was clicked. */
export type Lightbox = { urls: string[]; index: number; caption: string } | null;

export function ScreenshotLightbox({
  value,
  onClose,
}: {
  value: Lightbox;
  onClose: () => void;
}) {
  // Which chart is showing. Reset whenever a different set is opened, by keying
  // the state to the value rather than syncing it in an effect.
  const [shown, setShown] = useState<{ for: Lightbox; index: number }>({
    for: null,
    index: 0,
  });
  const index = shown.for === value ? shown.index : (value?.index ?? 0);
  const count = value?.urls.length ?? 0;

  useEffect(() => {
    if (!value) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (count < 2) return;
      if (event.key === "ArrowRight") {
        setShown({ for: value, index: (index + 1) % count });
      }
      if (event.key === "ArrowLeft") {
        setShown({ for: value, index: (index - 1 + count) % count });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [value, onClose, index, count]);

  function go(step: number) {
    if (!value) return;
    setShown({ for: value, index: (index + step + count) % count });
  }

  return (
    <AnimatePresence>
      {value ? (
        <motion.div
          className="fixed inset-0 z-60 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm" />
          <motion.figure
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="relative max-h-full w-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value.urls[index]}
                alt={value.caption}
                className="max-h-[80vh] w-full rounded-2xl bg-white object-contain ring-1 ring-white/15 dark:bg-gray-900"
              />
              {count > 1 ? (
                <>
                  <NavButton side="left" label="Previous chart" onClick={() => go(-1)} />
                  <NavButton side="right" label="Next chart" onClick={() => go(1)} />
                </>
              ) : null}
            </div>
            <figcaption className="mt-3 flex items-center justify-between gap-4 text-theme-sm text-gray-300">
              <span>
                {value.caption}
                {count > 1 ? (
                  <span className="tnum ml-2 text-gray-400">
                    · {index + 1} / {count}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-white transition-colors hover:bg-white/10"
              >
                Close
              </button>
            </figcaption>
          </motion.figure>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function NavButton({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-gray-900/70 text-white ring-1 ring-white/15 transition-colors hover:bg-gray-900 ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={side === "left" ? "M14.5 6l-6 6 6 6" : "M9.5 6l6 6-6 6"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
