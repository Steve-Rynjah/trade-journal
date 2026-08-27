/**
 * Deciding what the cursor is over.
 *
 * Handles win over bodies, and later drawings win over earlier ones, which
 * together give the behaviour people expect: you can always grab the corner of
 * the shape you just drew, even when it sits on top of five others.
 */

import {
  distanceToSegment,
  insideRect,
  nearRectEdge,
  styleOf,
  type Drawing,
  type Screen,
} from "@/lib/backtest/drawings";
import { handlePoints, type DrawingLayer } from "./drawing-layer";

/** Pixels of forgiveness around a line or handle. Tuned to feel like a mouse, not a pixel hunt. */
const SLOP = 6;
const HANDLE_SLOP = 9;
/**
 * A position's vertical borders get a wider band than a plain line.
 *
 * They are the only way to widen the box, they are competing for space with
 * three handles sitting on the same edge, and 6px of it was a pixel hunt.
 */
const EDGE_SLOP = 11;

export type Hit = {
  drawing: Drawing;
  /**
   * Which handle is being grabbed, or null to move the whole shape.
   *
   * For a position these are the four handles from `handlePoints` — 0 entry,
   * 1 target, 2 stop, 3 right edge — plus 4 for the box's left edge, which is
   * a grabbable border rather than a circle. For everything else it indexes
   * the anchors directly.
   */
  anchor: number | null;
};

export function hitTest(layer: DrawingLayer, drawings: Drawing[], point: Screen): Hit | null {
  const size = layer.size();
  if (!size) return null;

  // Back to front: the last drawing painted is the one on top.
  for (let i = drawings.length - 1; i >= 0; i--) {
    const drawing = drawings[i];
    if (drawing.locked) continue;

    const resolved: (Screen | null)[] = drawing.points.map((a) => layer.toScreen(a));
    if (resolved.some((s) => s === null)) continue;
    const screen = resolved as Screen[];

    const handles = handlePoints(drawing, screen);
    for (let h = 0; h < handles.length; h++) {
      if (Math.hypot(point.x - handles[h].x, point.y - handles[h].y) <= HANDLE_SLOP) {
        return { drawing, anchor: h };
      }
    }

    // Before falling through to "move the whole thing", check the vertical
    // borders of a position: that is how the box is widened from either side.
    const edge = positionEdge(drawing, screen, point);
    if (edge !== null) return { drawing, anchor: edge };

    if (overBody(drawing, screen, point, size)) return { drawing, anchor: null };
  }

  return null;
}

/**
 * Whether the cursor is on a position box's left or right border.
 *
 * Returns 4 for the left edge and 3 for the right, matching the drag codes the
 * handles use, so widening feels the same whichever side it is done from. The
 * band around the entry line is excluded: that belongs to the entry handle.
 */
function positionEdge(drawing: Drawing, screen: Screen[], point: Screen): number | null {
  if (drawing.kind !== "long-position" && drawing.kind !== "short-position") return null;

  const [entry, target, stop] = screen;
  const left = Math.min(entry.x, target.x);
  const right = Math.max(entry.x, target.x);
  const top = Math.min(entry.y, target.y, stop.y);
  const bottom = Math.max(entry.y, target.y, stop.y);

  if (point.y < top - EDGE_SLOP || point.y > bottom + EDGE_SLOP) return null;

  // The three circles on the left edge own their own pixels; the border owns
  // everything between them.
  const onAHandle = [entry.y, target.y, stop.y].some(
    (y) => Math.abs(point.y - y) <= HANDLE_SLOP,
  );

  const nearLeft = Math.abs(point.x - left) <= EDGE_SLOP;
  const nearRight = Math.abs(point.x - right) <= EDGE_SLOP;

  if (nearLeft && !onAHandle) return 4;
  // Only the entry handle sits on the right edge, so the rest of it is free.
  if (nearRight && Math.abs(point.y - entry.y) > HANDLE_SLOP) return 3;
  return null;
}

function overBody(
  drawing: Drawing,
  screen: Screen[],
  point: Screen,
  size: { width: number; height: number },
): boolean {
  const style = styleOf(drawing);

  switch (drawing.kind) {
    case "rectangle": {
      const [a, b] = screen;
      const corner = { x: style.extend ? size.width : Math.max(a.x, b.x), y: b.y };
      const origin = { x: Math.min(a.x, b.x), y: a.y };
      return nearRectEdge(point, origin, corner, SLOP) || insideRect(point, origin, corner);
    }

    case "trendline":
      return distanceToSegment(point, screen[0], screen[1]) <= SLOP;

    case "horizontal-ray":
      // The ray only exists to the right of its origin, so a click to the left
      // of it — however close in y — is a click on empty chart.
      return (
        point.x >= screen[0].x - SLOP &&
        point.x <= size.width &&
        Math.abs(point.y - screen[0].y) <= SLOP
      );

    case "vertical-line":
      return Math.abs(point.x - screen[0].x) <= SLOP;

    case "long-position":
    case "short-position": {
      const [entry, target, stop] = screen;
      const left = Math.min(entry.x, target.x);
      const right = Math.max(entry.x, target.x);
      const top = Math.min(entry.y, target.y, stop.y);
      const bottom = Math.max(entry.y, target.y, stop.y);
      return insideRect(point, { x: left, y: top }, { x: right, y: bottom });
    }
  }
}
