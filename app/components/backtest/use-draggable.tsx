"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Offset = { x: number; y: number };

/**
 * Lets a floating panel be dragged by a grip.
 *
 * The panel keeps whatever CSS position it was laid out with and is nudged from
 * there with a transform, so the sensible default placement survives — dragging
 * only ever moves it relative to where it already sat.
 */
export function useDraggable(initial: Offset = { x: 0, y: 0 }) {
  const [offset, setOffset] = useState<Offset>(initial);
  const dragging = useRef<{ pointer: number; startX: number; startY: number; from: Offset } | null>(
    null,
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Left button only: a right-click on the grip should still be a context menu.
      if (event.button !== 0) return;
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      dragging.current = {
        pointer: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        from: offset,
      };
    },
    [offset],
  );

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const state = dragging.current;
      if (!state || state.pointer !== event.pointerId) return;
      setOffset({
        x: state.from.x + (event.clientX - state.startX),
        y: state.from.y + (event.clientY - state.startY),
      });
    };
    const end = (event: PointerEvent) => {
      if (dragging.current?.pointer === event.pointerId) dragging.current = null;
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  return {
    offset,
    /** Spread onto the grip element. */
    gripProps: { onPointerDown, style: { cursor: "grab", touchAction: "none" as const } },
    style: { transform: `translate(${offset.x}px, ${offset.y}px)` },
  };
}

/** The six-dot grip TradingView puts on the left of a floating bar. */
export function Grip() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true" className="text-gray-400">
      {[3, 8, 13].map((cy) =>
        [2.5, 7.5].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.15" fill="currentColor" />),
      )}
    </svg>
  );
}
