"use client";

import { useState } from "react";

import type { ResultSplit } from "@/lib/stats";

const SIZE = 260;
const C = SIZE / 2;
const R = 96;
const INNER = 66;
/** The 2px surface gap between neighbouring fills, expressed as an angle. */
const GAP = 0.03;

type Slice = { key: string; label: string; value: number; color: string };

function arcPath(start: number, end: number): string {
  const large = end - start > Math.PI ? 1 : 0;
  const p = (angle: number, radius: number) =>
    [C + radius * Math.sin(angle), C - radius * Math.cos(angle)] as const;

  const [x0, y0] = p(start, R);
  const [x1, y1] = p(end, R);
  const [ix1, iy1] = p(end, INNER);
  const [ix0, iy0] = p(start, INNER);

  return [
    `M ${x0} ${y0}`,
    `A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`,
    `L ${ix1} ${iy1}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${ix0} ${iy0}`,
    "Z",
  ].join(" ");
}

/**
 * Win against lose as a share of decided trades.
 *
 * Blue and red rather than green and red: the pair separates cleanly for every
 * kind of colour blindness (ΔE 30 against 6 for green/red), and it matches the
 * Long vs Short bar. The legend still spells out each word beside its count, so
 * identity never rests on hue alone.
 */
export function WinLoseDonut({ split }: { split: ResultSplit }) {
  const [hovered, setHovered] = useState<string | null>(null);

  const slices: Slice[] = [
    { key: "win", label: "Win", value: split.wins, color: "#465fff" },
    { key: "lose", label: "Lose", value: split.losses, color: "#f04438" },
  ];

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <div className="h-40 w-40 rounded-full border-[30px] border-gray-100 dark:border-gray-800" />
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          No trades logged yet.
        </p>
      </div>
    );
  }

  const drawn = slices.filter((slice) => slice.value > 0);
  let cursor = 0;
  const arcs = drawn.map((slice) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const start = cursor;
    cursor += sweep;
    const gap = drawn.length > 1 ? GAP : 0;
    return {
      slice,
      share: slice.value / total,
      start: start + gap / 2,
      end: Math.max(start + gap / 2, start + sweep - gap / 2),
      mid: start + sweep / 2,
    };
  });

  // A single slice sweeps the whole circle, and an SVG arc whose start and end
  // land on the same point draws nothing at all — so a clean 100% month has to
  // be a stroked circle rather than a path.
  const fullRing = arcs.length === 1;

  const active = hovered ? arcs.find((arc) => arc.slice.key === hovered) : undefined;
  const heroValue = active
    ? `${Math.round(active.share * 100)}%`
    : `${split.winRate.toFixed(0)}%`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="animate-draw-in h-[240px] w-[240px]"
          role="img"
          aria-label={`Result split of ${total} trades: ${arcs
            .map(
              (arc) =>
                `${arc.slice.label} ${arc.slice.value}, ${Math.round(arc.share * 100)}%`,
            )
            .join("; ")}`}
        >
          {arcs.map((arc) => {
            const dimmed = hovered !== null && hovered !== arc.slice.key;

            return (
              <g key={arc.slice.key}>
                {fullRing ? (
                  <circle
                    cx={C}
                    cy={C}
                    r={(R + INNER) / 2}
                    fill="none"
                    stroke={arc.slice.color}
                    strokeWidth={R - INNER}
                    opacity={dimmed ? 0.35 : 1}
                    className="cursor-pointer transition-opacity duration-200"
                    onMouseEnter={() => setHovered(arc.slice.key)}
                    onMouseLeave={() => setHovered(null)}
                  />
                ) : (
                  <path
                    d={arcPath(arc.start, arc.end)}
                    fill={arc.slice.color}
                    opacity={dimmed ? 0.35 : 1}
                    className="cursor-pointer transition-opacity duration-200"
                    onMouseEnter={() => setHovered(arc.slice.key)}
                    onMouseLeave={() => setHovered(null)}
                  />
                )}
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="tnum text-title-sm font-bold text-gray-800 dark:text-white/90">
            {heroValue}
          </span>
        </div>
      </div>

      <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        {slices.map((slice) => {
          const share = total === 0 ? 0 : (slice.value / total) * 100;
          return (
            <li
              key={slice.key}
              className="flex items-center gap-2"
              onMouseEnter={() => setHovered(slice.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: slice.color }}
                aria-hidden="true"
              />
              <span className="text-theme-sm text-gray-700 dark:text-gray-300">
                {slice.label}
              </span>
              <span className="tnum text-theme-sm font-medium text-gray-500 dark:text-gray-400">
                {slice.value} · {share.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
