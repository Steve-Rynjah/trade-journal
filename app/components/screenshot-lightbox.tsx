"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

export type Lightbox = { url: string; caption: string } | null;

export function ScreenshotLightbox({
  value,
  onClose,
}: {
  value: Lightbox;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!value) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [value, onClose]);

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.url}
              alt={value.caption}
              className="max-h-[80vh] w-full rounded-2xl bg-white object-contain ring-1 ring-white/15 dark:bg-gray-900"
            />
            <figcaption className="mt-3 flex items-center justify-between text-theme-sm text-gray-300">
              <span>{value.caption}</span>
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
