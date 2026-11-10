"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MENU_WIDTH = 176;
const MENU_HEIGHT = 120;

/**
 * The ⋮ in the corner of a row's Chart cell: Edit, and Delete behind a confirm.
 *
 * The list is portalled and fixed-positioned — the table scrolls sideways, and
 * anything absolutely placed inside it would be clipped by that scroller.
 */
export function RowMenu({
  label,
  onEdit,
  onDelete,
  disabled,
}: {
  /** Names the row, e.g. "the trade on 10 - Nov - 2026". */
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [confirming, setConfirming] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setAnchor(null);
      setConfirming(false);
    };
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (menuRef.current?.contains(target) || buttonRef.current?.contains(target));

    const onPointerDown = (event: MouseEvent) => {
      if (!inside(event.target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // Pinned to where the button was; once the page moves it points at nothing.
    const onScroll = (event: Event) => {
      if (!inside(event.target)) close();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle() {
    setConfirming(false);
    setAnchor((current) => (current ? null : buttonRef.current!.getBoundingClientRect()));
  }

  function close() {
    setAnchor(null);
    setConfirming(false);
  }

  // Hang from the button's right edge; open upward near the foot of the window.
  const above =
    anchor !== null &&
    window.innerHeight - anchor.bottom < MENU_HEIGHT &&
    anchor.top > window.innerHeight - anchor.bottom;

  const ITEM =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-theme-sm transition-colors";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${label}`}
        title="Edit or delete"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
          open
            ? "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-white"
            : "text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5.5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="18.5" r="1.7" />
        </svg>
      </button>

      {anchor
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${label}`}
              style={{
                left: Math.max(8, anchor.right - MENU_WIDTH),
                width: MENU_WIDTH,
                ...(above
                  ? { bottom: window.innerHeight - anchor.top + 6 }
                  : { top: anchor.bottom + 6 }),
              }}
              className="animate-rise fixed z-50 rounded-xl border border-gray-200 bg-white p-1.5 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
            >
              {confirming ? (
                <div className="px-2 py-1.5">
                  <p className="text-theme-sm text-gray-700 dark:text-gray-300">Delete this trade?</p>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        onDelete();
                      }}
                      className="flex-1 rounded-lg bg-error-500 px-2 py-1.5 text-theme-xs font-medium text-white hover:bg-error-600"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="flex-1 rounded-lg px-2 py-1.5 text-theme-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      onEdit();
                    }}
                    className={`${ITEM} text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M16.5 4.5l3 3L8 19l-4.5 1.5L5 16 16.5 4.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    </svg>
                    Edit
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setConfirming(true)}
                    className={`${ITEM} text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/12`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 6.5h16M9.5 6.5v-2h5v2M6.5 6.5l1 13h9l1-13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Delete
                  </button>
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
