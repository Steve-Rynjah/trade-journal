"use client";

import {
  CandlestickSeries,
  createChart,
  CrosshairMode,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Logical,
  type Time,
} from "lightweight-charts";
import { useCallback, useEffect, useRef } from "react";

import { TIMEFRAME_SECONDS, type Candle, type Timeframe } from "@/lib/backtest/candles";
import type { ChartTheme } from "@/lib/backtest/chart-theme";
import {
  logicalToTime,
  newId,
  seedAnchors,
  snapToQuarter,
  ANCHOR_COUNT,
  TOOL_DEFAULTS,
  type Anchor,
  type Drawing,
  type ToolKind,
} from "@/lib/backtest/drawings";
import type { Screen } from "@/lib/backtest/drawings";
import { DrawingLayer } from "./drawing-layer";
import { hitTest, type Hit } from "./hit-test";

type Props = {
  candles: Candle[];
  timeframe: Timeframe;
  /** The tool armed in the rail, or null when the cursor is just a cursor. */
  activeTool: ToolKind | null;
  onToolUsed: () => void;
  drawings: Drawing[];
  onDrawingsChange: (next: Drawing[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Double-click opens the style editor for that drawing. */
  onEdit: (id: string) => void;
  /** Saved per-tool styling, applied to the next drawing of that kind. */
  presets: Partial<Record<ToolKind, Partial<Drawing>>>;
  theme: ChartTheme;
};

/** What the pointer is currently in the middle of doing. */
type Gesture =
  | { mode: "idle" }
  | { mode: "creating"; draft: Drawing; origin: Screen }
  | {
      mode: "moving";
      id: string;
      anchor: number | null;
      origin: Anchor[];
      from: Anchor;
      fromScreen: Screen;
    };

export function Chart({
  candles,
  timeframe,
  activeTool,
  onToolUsed,
  drawings,
  onDrawingsChange,
  selectedId,
  onSelect,
  onEdit,
  presets,
  theme,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const layerRef = useRef<DrawingLayer | null>(null);
  const gestureRef = useRef<Gesture>({ mode: "idle" });
  /** What the series currently holds, so a replay tick can update one bar. */
  const appliedRef = useRef<{ key: string; length: number } | null>(null);
  /** The first paint frames the data; later ones must not yank the view back. */
  const didFitRef = useRef(false);
  /** Pointer position while a handle is being dragged, for the guide lines. */
  const guideRef = useRef<Screen | null>(null);
  /** Live theme for the mount-time effect, which binds only once. */
  const themeRef = useRef(theme);

  // Live values for the pointer handlers, which are bound once and would
  // otherwise capture whatever these were on the first render. Written in an
  // effect rather than during render: the handlers only ever read them in
  // response to input, which cannot happen before the commit that sets them.
  const latest = useRef({ candles, timeframe, activeTool, drawings, selectedId, presets, theme });
  const callbacks = useRef({ onDrawingsChange, onSelect, onToolUsed, onEdit });

  useEffect(() => {
    latest.current = { candles, timeframe, activeTool, drawings, selectedId, presets, theme };
    themeRef.current = theme;
    callbacks.current = { onDrawingsChange, onSelect, onToolUsed, onEdit };
  });

  /** Repaint the drawing layer from whatever the current props say. */
  const sync = useCallback((draft: Drawing | null, hoveredId: string | null = null) => {
    layerRef.current?.update({
      drawings: latest.current.drawings,
      draft,
      selectedId: latest.current.selectedId,
      hoveredId,
      candles: latest.current.candles,
      timeframe: latest.current.timeframe,
      arrowColor: latest.current.theme.positionArrow,
      // Read from the ref, never passed in: dragging a handle re-renders on
      // every move, and that render calls `sync` again — an argument would be
      // dropped on the way through and the guide would flicker out instantly.
      guide: guideRef.current,
    });
  }, []);

  /** Pointer event to an anchor in chart space. */
  const toAnchor = useCallback((event: PointerEvent): Anchor | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const host = hostRef.current;
    if (!chart || !series || !host) return null;

    const rect = host.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const logical = chart.timeScale().coordinateToLogical(x);
    const price = series.coordinateToPrice(y);
    if (logical === null || price === null) return null;

    return {
      time: logicalToTime(latest.current.candles, logical as number, latest.current.timeframe),
      price,
    };
  }, []);

  /**
   * A starting risk distance for a freshly placed position.
   *
   * Taken from what is actually on screen rather than a fixed pip count: the
   * same constant would be invisible zoomed out and fill the pane zoomed in.
   */
  const defaultRisk = useCallback((): number => {
    const chart = chartRef.current;
    if (!chart) return 0.001;
    const range = chart.priceScale("right").getVisibleRange();
    if (!range) return 0.001;
    // A tenth of the visible range each way, so a fresh 1:1 fills a fifth of
    // the pane — roughly what TradingView gives you, and big enough to grab.
    return Math.abs(range.to - range.from) * 0.1;
  }, []);

  const toScreen = useCallback((event: PointerEvent) => {
    const host = hostRef.current;
    if (!host) return null;
    const rect = host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  // ---- chart lifecycle -----------------------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const chart = createChart(host, {
      layout: { attributionLogo: false, fontFamily: "Outfit, ui-sans-serif, system-ui, sans-serif" },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderVisible: false, rightOffset: 12, barSpacing: 8, timeVisible: true, secondsVisible: false },
      // The bars must not slide under the cursor while a shape is being dragged
      // out, so the chart's own drag handling stays off until a gesture ends.
      handleScroll: true,
      handleScale: true,
    });

    const series = chart.addSeries(CandlestickSeries, {
      priceFormat: { type: "price", precision: 5, minMove: 0.00001 },
    });

    const layer = new DrawingLayer();
    series.attachPrimitive(layer);

    chartRef.current = chart;
    seriesRef.current = series;
    layerRef.current = layer;
    // This series is empty, so the next data effect must lay down the whole set.
    // Leaving stale bookkeeping here is what makes a remount — React StrictMode
    // performs one in development — feed a single bar into an empty chart.
    appliedRef.current = null;
    didFitRef.current = false;

    // Everything visual now comes from the theme object, so the settings panel
    // and the app's own light/dark switch drive the same code path.
    const applyTheme = () => {
      chart.applyOptions({
        layout: {
          background: { color: themeRef.current.background },
          textColor: themeRef.current.scaleText,
        },
        grid: {
          vertLines: { color: themeRef.current.grid, visible: themeRef.current.showGrid },
          horzLines: { color: themeRef.current.grid, visible: themeRef.current.showGrid },
        },
      });
    };
    applyTheme();
    const themeWatch = new MutationObserver(applyTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    /**
     * Wheel over the price axis scales price, the way TradingView does.
     *
     * lightweight-charts only offers press-and-drag on the axis, which is why a
     * two-finger scroll appeared to do nothing while holding a click and moving
     * worked. Over the chart body the event is left alone so the built-in time
     * zoom still runs.
     */
    const priceScale = chart.priceScale("right");

    const onWheel = (event: WheelEvent) => {
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Only over this chart's price axis. Bound on window rather than the
      // container, so the bounds have to be checked by hand.
      const overChart =
        x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      if (!overChart || x < chart.timeScale().width()) return;

      // Capture phase and stopPropagation, not just preventDefault: the
      // library binds its own wheel handler to an inner canvas, so by the time
      // a bubbling listener runs it has *already* zoomed the time axis. That is
      // what made a scroll on the price scale zoom the whole chart instead of
      // stretching it vertically.
      event.preventDefault();
      event.stopPropagation();
      const range = priceScale.getVisibleRange();
      if (!range) return;

      // Proportional to how hard the wheel was turned, not a fixed step per
      // event. A trackpad fires a stream of small deltas, and a flat 10% each
      // time made the axis bolt away; this keeps a two-finger drag to roughly a
      // percent per event while a mouse notch still moves usefully far. The
      // clamp stops a flung gesture from jumping a whole screen.
      const intensity = Math.max(-0.12, Math.min(0.12, event.deltaY * 0.0015));
      const factor = Math.exp(intensity);
      const middle = (range.from + range.to) / 2;

      // Auto scale would immediately undo this, so the axis is pinned the
      // moment it is scaled by hand — double-click on the axis resets it.
      priceScale.setAutoScale(false);
      priceScale.setVisibleRange({
        from: middle - (middle - range.from) * factor,
        to: middle + (range.to - middle) * factor,
      });
    };

    // window, in the capture phase: the library binds its own wheel handler to
    // an element inside the container, and a capture listener on the container
    // still was not early enough to stop it — the time axis kept zooming along
    // with the price scale. From window nothing can run before this.
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });

    // ResizeObserver rather than a window listener: the sidebar collapsing
    // changes the chart's width without the window ever resizing.
    const resize = new ResizeObserver(() => {
      chart.applyOptions({ width: host.clientWidth, height: host.clientHeight });
    });
    resize.observe(host);

    return () => {
      resize.disconnect();
      themeWatch.disconnect();
      window.removeEventListener("wheel", onWheel, { capture: true });
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      layerRef.current = null;
      appliedRef.current = null;
    };
  }, []);

  // Appearance is applied in its own effect so changing a colour never rebuilds
  // the chart — and never resets the viewport the user has scrolled to.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    chart.applyOptions({
      layout: { background: { color: theme.background }, textColor: theme.scaleText },
      grid: {
        vertLines: { color: theme.grid, visible: theme.showGrid },
        horzLines: { color: theme.grid, visible: theme.showGrid },
      },
      timeScale: {
        rightOffset: theme.rightOffset,
        borderVisible: theme.showScaleLines,
        borderColor: theme.scaleLine,
      },
      rightPriceScale: {
        scaleMargins: { top: theme.marginTop / 100, bottom: theme.marginBottom / 100 },
        borderVisible: theme.showScaleLines,
        borderColor: theme.scaleLine,
      },
    });

    series.applyOptions({
      upColor: theme.upColor,
      downColor: theme.downColor,
      borderVisible: theme.showBorders,
      borderUpColor: theme.upBorder,
      borderDownColor: theme.downBorder,
      wickVisible: theme.showWicks,
      wickUpColor: theme.upWick,
      wickDownColor: theme.downWick,
    });
  }, [theme]);

  // ---- data ---------------------------------------------------------------
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const toBar = (c: Candle): CandlestickData<Time> => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    });

    // Replay advances one candle at a time, and `setData` on every tick would
    // rebuild the whole series — tens of thousands of bars — sixty times a
    // second. When the only thing that moved is the bar still forming, hand the
    // chart that one bar instead; `setData` is kept for the changes that really
    // do replace the series.
    const previous = appliedRef.current;
    const key = `${timeframe}:${candles[0]?.time ?? 0}`;
    const grewByOneAtMost =
      previous !== null &&
      previous.key === key &&
      candles.length >= previous.length &&
      candles.length <= previous.length + 1;

    if (grewByOneAtMost && candles.length > 0) {
      series.update(toBar(candles[candles.length - 1]));
    } else {
      series.setData(candles.map(toBar));
    }

    appliedRef.current = { key, length: candles.length };

    // Frame the view once, when the candles first arrive.
    //
    // Via bar spacing rather than a logical range. `fitContent` would squeeze
    // every bar behind the cursor into the pane — tens of thousands at 5m — and
    // a logical range does not survive the ResizeObserver applying the real
    // width a moment later: the library keeps bar spacing across a resize and
    // recomputes the range, so the view silently widened back out. Bar spacing
    // is the thing it actually preserves, so that is what gets set.
    if (!didFitRef.current && candles.length > 0) {
      const scale = chartRef.current?.timeScale();
      const width = scale?.width() ?? 0;
      if (width > 0) {
        didFitRef.current = true;
        scale?.applyOptions({ barSpacing: Math.max(2, width / VISIBLE_BARS) });
        scale?.scrollToPosition(RIGHT_PADDING_BARS, false);
      }
    }

    sync(null);
  }, [candles, timeframe, sync]);

  useEffect(() => {
    sync(gestureRef.current.mode === "creating" ? gestureRef.current.draft : null);
  }, [drawings, selectedId, timeframe, sync]);

  // ---- pointer interaction ------------------------------------------------
  useEffect(() => {
    const overlay = overlayRef.current;
    const host = hostRef.current;
    if (!overlay || !host) return;

    /**
     * The overlay only swallows events when it has a reason to.
     *
     * With it transparent to the pointer, the chart gets the drag and pans as
     * normal; the moment the cursor is over a drawing or a tool is armed, it
     * takes over so the chart cannot pan out from under the gesture.
     */
    const setCapturing = (capturing: boolean, cursor: string) => {
      overlay.style.pointerEvents = capturing ? "auto" : "none";
      overlay.style.cursor = cursor;
    };

    const hover = (event: PointerEvent) => {
      if (gestureRef.current.mode !== "idle") return;

      if (latest.current.activeTool) {
        setCapturing(true, "crosshair");
        return;
      }

      const layer = layerRef.current;
      const point = toScreen(event);
      if (!layer || !point) return;

      const hit = hitTest(layer, latest.current.drawings, point);
      setCapturing(hit !== null, cursorFor(hit));
      sync(null, hit?.drawing.id ?? null);
    };

    const down = (event: PointerEvent) => {
      const anchor = toAnchor(event);
      const layer = layerRef.current;
      const point = toScreen(event);
      if (!anchor || !layer || !point) return;

      const tool = latest.current.activeTool;

      if (tool) {
        const preset = TOOL_DEFAULTS[tool];
        const draft: Drawing = {
          id: newId(),
          kind: tool,
          points: seedAnchors(tool, anchor, anchor, defaultRisk()),
          color: preset.color,
          lineWidth: preset.lineWidth,
          ...(latest.current.presets[tool] ?? {}),
        };
        gestureRef.current = { mode: "creating", draft, origin: point };
        overlay.setPointerCapture(event.pointerId);
        sync(draft);
        return;
      }

      const hit = hitTest(layer, latest.current.drawings, point);
      if (!hit) {
        callbacks.current.onSelect(null);
        setCapturing(false, "default");
        return;
      }

      callbacks.current.onSelect(hit.drawing.id);
      gestureRef.current = {
        mode: "moving",
        id: hit.drawing.id,
        anchor: hit.anchor,
        origin: hit.drawing.points.map((p) => ({ ...p })),
        from: anchor,
        fromScreen: point,
      };
      overlay.setPointerCapture(event.pointerId);
    };

    const move = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (gesture.mode === "idle") {
        hover(event);
        return;
      }

      const anchor = toAnchor(event);
      const point = toScreen(event);
      if (!anchor) return;

      if (gesture.mode === "creating") {
        const start = gesture.draft.points[0];
        // Shift pins a trend line to the nearest quarter turn — a level or a
        // divider, never "almost" one.
        const end =
          event.shiftKey && gesture.draft.kind === "trendline" && point
            ? snapToQuarter(start, anchor, {
                dx: point.x - gesture.origin.x,
                dy: point.y - gesture.origin.y,
              })
            : anchor;

        const draft = {
          ...gesture.draft,
          points: seedAnchors(gesture.draft.kind, start, end, defaultRisk()),
        };
        gestureRef.current = { mode: "creating", draft, origin: gesture.origin };
        sync(draft);
        return;
      }

      // Only for a handle drag. Moving the whole shape needs no guide — there
      // is no single level being placed.
      guideRef.current = gesture.anchor !== null ? point : null;

      const next = latest.current.drawings.map((drawing) => {
        if (drawing.id !== gesture.id) return drawing;

        if (gesture.anchor === null) {
          // Whole-shape drag: shift every anchor by the same delta so the shape
          // keeps its proportions instead of shearing.
          const dt = anchor.time - gesture.from.time;
          const dp = anchor.price - gesture.from.price;
          return {
            ...drawing,
            points: gesture.origin.map((p) => ({ time: p.time + dt, price: p.price + dp })),
          };
        }

        const points = gesture.origin.map((p) => ({ ...p }));

        if (drawing.kind === "long-position" || drawing.kind === "short-position") {
          // One candle of the current timeframe: the narrowest a box may get.
          const minSpan = TIMEFRAME_SECONDS[latest.current.timeframe];
          // The four handles are semantic, not positional: three of them move a
          // single price and the fourth only widens the box. Letting any of them
          // write a time as well is what would shear the shape apart.
          switch (gesture.anchor) {
            case 0:
              // Entry moves in both axes: dragging it sideways is how the box's
              // left edge is pulled back across the chart, which is the one
              // thing the three left-hand grips could not do.
              points[0] = {
                price: anchor.price,
                time: Math.min(anchor.time, points[1].time - minSpan),
              };
              break;
            case 1:
              points[1] = { ...points[1], price: anchor.price };
              break;
            case 2:
              points[2] = { ...points[2], price: anchor.price };
              break;
            case 3:
              // Clamped so the right edge cannot be dragged past the left one.
              // Letting them swap silently reverses which handle is which, and
              // the "right" grip then starts widening the box leftwards.
              points[1] = { ...points[1], time: Math.max(anchor.time, points[0].time + minSpan) };
              break;
            case 4:
              // The left edge carries entry and stop with it, so the box slides
              // open from that side instead of detaching from its own levels.
              points[0] = { ...points[0], time: Math.min(anchor.time, points[1].time - minSpan) };
              break;
          }
          // Entry and stop share the left edge by definition.
          points[2] = { ...points[2], time: points[0].time };
          return { ...drawing, points };
        }

        points[gesture.anchor] =
          event.shiftKey && drawing.kind === "trendline"
            ? snapToQuarter(points[gesture.anchor === 0 ? 1 : 0], anchor, {
                dx: point ? point.x - gesture.fromScreen.x : 0,
                dy: point ? point.y - gesture.fromScreen.y : 0,
              })
            : anchor;
        return { ...drawing, points };
      });

      callbacks.current.onDrawingsChange(next);
    };

    const up = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      gestureRef.current = { mode: "idle" };

      guideRef.current = null;
      if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);

      if (gesture.mode === "creating") {
        const draft = gesture.draft;
        const [first] = draft.points;
        const last = draft.points[draft.points.length - 1];

        // A click with no drag would commit a zero-size shape that is
        // impossible to grab again, so give it a default width. Positions count
        // as degenerate on width alone — their height is seeded, not dragged.
        const isPosition =
          draft.kind === "long-position" || draft.kind === "short-position";
        const degenerate = isPosition
          ? first.time === last.time
          : ANCHOR_COUNT[draft.kind] === 2 && first.time === last.time && first.price === last.price;
        const committed = degenerate
          ? withDefaultSpan(draft, latest.current, defaultRisk())
          : draft;

        callbacks.current.onDrawingsChange([...latest.current.drawings, committed]);
        callbacks.current.onSelect(committed.id);
        callbacks.current.onToolUsed();
      }

      setCapturing(false, "default");
      sync(null);
    };

    /**
     * A click on bare chart clears the selection.
     *
     * It has to live on the host, not the overlay: over empty chart the overlay
     * is transparent to the pointer so the chart can pan, which means a click
     * out there never reached the overlay's own handler and the selected
     * position kept its labels forever.
     */
    const clickAway = (event: MouseEvent) => {
      if (gestureRef.current.mode !== "idle") return;

      const layer = layerRef.current;
      const host_ = hostRef.current;
      if (!layer || !host_ || latest.current.activeTool) return;

      const chart = chartRef.current;
      if (!chart) return;

      const rect = host_.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      // A click on the price axis is a scale gesture, not a deselection.
      if (point.x > chart.timeScale().width()) return;

      if (!hitTest(layer, latest.current.drawings, point)) callbacks.current.onSelect(null);
    };

    const doubleClick = (event: MouseEvent) => {
      const layer = layerRef.current;
      const host_ = hostRef.current;
      if (!layer || !host_) return;

      const rect = host_.getBoundingClientRect();
      const hit = hitTest(layer, latest.current.drawings, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      if (!hit) return;

      event.preventDefault();
      callbacks.current.onSelect(hit.drawing.id);
      callbacks.current.onEdit(hit.drawing.id);
    };

    /**
     * Hand the wheel back to the chart.
     *
     * While the cursor is over a drawing the overlay takes pointer events so
     * the shape can be grabbed — but that also swallowed the wheel, so the
     * chart froze whenever the mouse happened to be over a marked-up zone.
     * Re-dispatching onto a chart canvas puts the zoom back without giving up
     * the drag.
     */
    const forwardWheel = (event: WheelEvent) => {
      const canvas = host.querySelector("canvas");
      if (!canvas) return;

      event.preventDefault();
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          clientX: event.clientX,
          clientY: event.clientY,
          bubbles: true,
          cancelable: true,
        }),
      );
    };

    overlay.addEventListener("wheel", forwardWheel, { passive: false });
    host.addEventListener("pointermove", hover);
    host.addEventListener("click", clickAway);
    host.addEventListener("dblclick", doubleClick);
    overlay.addEventListener("pointerdown", down);
    overlay.addEventListener("dblclick", doubleClick);
    overlay.addEventListener("pointermove", move);
    overlay.addEventListener("pointerup", up);
    overlay.addEventListener("pointercancel", up);

    return () => {
      overlay.removeEventListener("wheel", forwardWheel);
      host.removeEventListener("pointermove", hover);
      host.removeEventListener("click", clickAway);
      host.removeEventListener("dblclick", doubleClick);
      overlay.removeEventListener("pointerdown", down);
      overlay.removeEventListener("dblclick", doubleClick);
      overlay.removeEventListener("pointermove", move);
      overlay.removeEventListener("pointerup", up);
      overlay.removeEventListener("pointercancel", up);
    };
  }, [sync, toAnchor, toScreen, defaultRisk]);

  // Arming a tool should change the cursor immediately, before any movement.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (activeTool) {
      overlay.style.pointerEvents = "auto";
      overlay.style.cursor = "crosshair";
    } else if (gestureRef.current.mode === "idle") {
      overlay.style.pointerEvents = "none";
      overlay.style.cursor = "default";
    }
  }, [activeTool]);

  // ---- keyboard -----------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (event.key === "Escape") {
        callbacks.current.onToolUsed();
        callbacks.current.onSelect(null);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && latest.current.selectedId) {
        event.preventDefault();
        callbacks.current.onDrawingsChange(
          latest.current.drawings.filter((d) => d.id !== latest.current.selectedId),
        );
        callbacks.current.onSelect(null);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />
      {/* z-index is load-bearing, not decoration: lightweight-charts stacks its
          own canvases at z-index 1 and 2, and a positioned sibling left at
          `auto` paints *underneath* them however late it appears in the DOM.
          Without this the overlay never receives a pointer event and every
          drawing tool silently does nothing. */}
      <div
        ref={overlayRef}
        className="absolute inset-0 z-10"
        style={{ pointerEvents: "none" }}
      />
    </div>
  );
}

/**
 * Gives a click-without-drag a shape you can actually see and grab.
 *
 * `risk` matters here as much as the width: without it a tapped position seeds
 * a zero-height box, and every label reads 0.00000 with an undefined ratio.
 */
function withDefaultSpan(
  draft: Drawing,
  ctx: { candles: Candle[]; timeframe: Timeframe },
  risk: number,
): Drawing {
  const start = draft.points[0];
  const span = ctx.candles.length > 1 ? ctx.candles[1].time - ctx.candles[0].time : 3600;
  const end: Anchor = { time: start.time + span * 34, price: start.price * 0.999 };
  return { ...draft, points: seedAnchors(draft.kind, start, end, risk) };
}

export type { Logical };

/** Roughly what TradingView opens on: enough bars to read, not a wall of them. */
/**
 * Bars framed on first paint.
 *
 * TradingView opens on roughly this many; fewer makes the candles fat and the
 * chart feel zoomed into nothing, more turns them back into a hairline smear.
 */
const VISIBLE_BARS = 240;
/** Breathing room to the right of the last bar, in bars. */
const RIGHT_PADDING_BARS = 12;

/** What the pointer should look like over a given hit. */
function cursorFor(hit: Hit | null): string {
  if (!hit) return "default";
  if (hit.anchor === null) return "move";

  // Crosshair over a grab point, never the hand: the hand suggests "click to
  // follow", when what is about to happen is a precise drag.
  const position = hit.drawing.kind === "long-position" || hit.drawing.kind === "short-position";
  if (!position) return "crosshair";

  // Entry moves the trade; the price handles slide vertically and the two box
  // edges slide horizontally, so each says which way it will go.
  if (hit.anchor === 0) return "crosshair";
  if (hit.anchor === 3 || hit.anchor === 4) return "ew-resize";
  return "ns-resize";
}
