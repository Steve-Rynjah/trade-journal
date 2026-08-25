"use client";

import { PAGE_SIZES } from "@/lib/stats";
import { SelectMenu, type MenuOption } from "./select-menu";

function Arrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M14.5 5.5L8 12l6.5 6.5" : "M9.5 5.5L16 12l-6.5 6.5"}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STEP =
  "flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-40 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white";

/**
 * The bar under the sheet: how many rows a page shows, which rows you are
 * looking at, and the way to the rest.
 *
 * A sheet holds 25 rows and the smallest page is 6, so there are never more
 * than five pages — every one of them gets its own button, with no ellipsis to
 * reason about.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  /** 1-based, and already clamped into range by the caller. */
  page: number;
  pageCount: number;
  pageSize: number;
  /** Rows on the whole sheet, not on this page. */
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const sizeOptions: MenuOption<number>[] = PAGE_SIZES.map((size) => ({
    value: size,
    label: String(size),
  }));

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 px-5 py-3.5 dark:border-gray-800">
      <div className="flex items-center gap-2.5">
        <span className="text-theme-sm text-gray-500 dark:text-gray-400">Rows</span>
        {/* Upwards: this sits at the foot of the page, where a menu dropping
            down would open below the fold. */}
        <SelectMenu
          label="Rows per page"
          value={pageSize}
          options={sizeOptions}
          onChange={onPageSize}
          widthClass="w-24"
          placement="up"
        />
      </div>

      <p className="tnum text-theme-sm text-gray-500 dark:text-gray-400">
        <span className="font-medium text-gray-800 dark:text-white/90">
          {first}–{last}
        </span>{" "}
        of {total}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={STEP}
        >
          <Arrow direction="left" />
        </button>

        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => {
          const current = number === page;
          return (
            <button
              key={number}
              type="button"
              onClick={() => onPage(number)}
              aria-label={`Page ${number}`}
              aria-current={current ? "page" : undefined}
              className={`tnum h-9 min-w-9 rounded-lg px-2.5 text-theme-sm font-medium transition-colors ${
                current
                  ? "bg-brand-500 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
              }`}
            >
              {number}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
          className={STEP}
        >
          <Arrow direction="right" />
        </button>
      </div>
    </div>
  );
}
