/**
 * Shape of a saved drawing set, shared by the server actions and the panel.
 *
 * Kept apart from `drawings.ts` so the client bundle can import the drawing
 * geometry without dragging the persistence types along with it.
 */

import type { Timeframe } from "./candles";
import type { Drawing, ToolKind } from "./drawings";

export type DrawingSet = {
  id: string;
  name: string;
  timeframe: Timeframe;
  drawings: Drawing[];
  updatedAt: string;
  /**
   * Null for a set of shapes; a tool name for a saved style preset.
   *
   * The two live in one table because they are the same thing stored twice over
   * — a name, and some drawing JSON — and splitting them would have meant two
   * of every query for no gain.
   */
  kind: ToolKind | null;
};

/** The styling fields a preset carries over to the next shape drawn. */
export type StylePreset = Partial<Drawing>;

const PRESET_FIELDS = [
  "color",
  "lineWidth",
  "fill",
  "showFill",
  "fillOpacity",
  "showBorder",
  "extend",
  "stopColor",
  "targetColor",
  "accountSize",
  "riskPercent",
] as const;

/** Strips a drawing down to just its look, dropping where it sat. */
export function styleFrom(drawing: Drawing): StylePreset {
  const preset: StylePreset = {};
  for (const field of PRESET_FIELDS) {
    const value = drawing[field];
    if (value !== undefined) Object.assign(preset, { [field]: value });
  }
  return preset;
}

export const MAX_SET_NAME = 60;
export const SYMBOL = "EURUSD";

/**
 * Trusts nothing that comes back from the database.
 *
 * `drawings` is a jsonb column with no schema behind it, so a row written by an
 * older build — or a hand-edited one — could be any shape at all. Anything that
 * does not parse is dropped rather than allowed to reach the renderer, where a
 * missing anchor would throw on every frame.
 */
export function parseDrawings(value: unknown): Drawing[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is Drawing => {
    if (typeof item !== "object" || item === null) return false;
    const candidate = item as Partial<Drawing>;

    return (
      typeof candidate.id === "string" &&
      typeof candidate.kind === "string" &&
      typeof candidate.color === "string" &&
      typeof candidate.lineWidth === "number" &&
      Array.isArray(candidate.points) &&
      candidate.points.length > 0 &&
      candidate.points.every(
        (point) =>
          typeof point === "object" &&
          point !== null &&
          Number.isFinite((point as { time?: unknown }).time) &&
          Number.isFinite((point as { price?: unknown }).price),
      )
    );
  });
}
