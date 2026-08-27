/**
 * Paints every drawing onto the chart's own canvas.
 *
 * This is a lightweight-charts *primitive* rather than a positioned <canvas> or
 * a stack of divs, and that choice is the whole reason panning stays smooth: the
 * library calls us inside the same frame it draws the candles, so a drawing can
 * never lag a pixel behind the bar it is anchored to.
 */

import type {
  IChartApi,
  ISeriesPrimitiveAxisView,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

import type { Candle, Timeframe } from "@/lib/backtest/candles";
import {
  positionStats,
  styleOf,
  timeToLogical,
  type Anchor,
  type Drawing,
  type Screen,
} from "@/lib/backtest/drawings";

/** Everything the layer needs to paint a frame. */
export type LayerState = {
  drawings: Drawing[];
  /** The shape being dragged out right now, painted but not yet committed. */
  draft: Drawing | null;
  selectedId: string | null;
  hoveredId: string | null;
  candles: Candle[];
  timeframe: Timeframe;
  /**
   * Where a handle is being dragged right now, in pixels.
   *
   * Drives the guide lines. While the overlay owns the pointer the chart's own
   * crosshair stops tracking, so without these a drag has no feedback at all
   * and there is no way to line a level up against the candles to the left —
   * which is what made the handles feel dead even though they were moving.
   */
  guide: Screen | null;
};

const HANDLE_RADIUS = 5;
const HANDLE_STROKE = "#2962ff";
const FONT = "12px Outfit, ui-sans-serif, system-ui, sans-serif";

export class DrawingLayer implements ISeriesPrimitive<Time> {
  private state: LayerState = {
    drawings: [],
    draft: null,
    selectedId: null,
    hoveredId: null,
    candles: [],
    timeframe: "4h",
    guide: null,
  };

  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType, Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private readonly views: IPrimitivePaneView[] = [new DrawingPaneView(this)];
  private readonly priceBandViews: IPrimitivePaneView[] = [new PriceBandView(this)];
  private readonly timeBandViews: IPrimitivePaneView[] = [new TimeBandView(this)];

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }

  /**
   * Entry, target and stop as labels on the price axis.
   *
   * This is what makes a position readable against the candles beside it: the
   * box says where the levels are relative to each other, the axis says what
   * they actually are. Only the position being worked on gets them, or three
   * chips per drawing would bury the scale.
   */
  /**
   * The position currently being worked on, if any.
   *
   * Everything the axes draw hangs off this: chips, range bands and edge
   * labels all belong to one selected trade and vanish with it.
   */
  activePosition(): Drawing | null {
    const { drawings, selectedId, hoveredId } = this.state;
    return (
      drawings.find(
        (d) =>
          (d.id === selectedId || d.id === hoveredId) &&
          (d.kind === "long-position" || d.kind === "short-position"),
      ) ?? null
    );
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    const active = this.activePosition();
    if (!active || !this.series) {
      // Same array identity when there is nothing to show — the library caches
      // on reference and a fresh [] every frame would defeat that.
      return EMPTY_AXIS_VIEWS;
    }

    const style = styleOf(active);
    const [entry, target, stop] = active.points;

    return [
      new LevelAxisView(this, entry.price, style.line, "#ffffff"),
      new LevelAxisView(this, target.price, style.targetColor, "#ffffff"),
      new LevelAxisView(this, stop.price, style.stopColor, "#ffffff"),
    ];
  }

  /**
   * The two ends of the position, labelled on the date strip.
   *
   * TradingView puts the box's span on the time axis the same way it puts its
   * levels on the price axis — so you can read *when* the trade runs without
   * counting candles.
   */
  timeAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    const active = this.activePosition();
    if (!active || !this.chart) return EMPTY_AXIS_VIEWS;

    const [entry, target] = active.points;
    const left = Math.min(entry.time, target.time);
    const right = Math.max(entry.time, target.time);

    return [
      new EdgeAxisView(this, left, "#434651"),
      new EdgeAxisView(this, right, "#2962ff"),
    ];
  }

  /** Bands on the price axis covering the reward and the risk. */
  priceAxisPaneViews(): readonly IPrimitivePaneView[] {
    return this.activePosition() ? this.priceBandViews : EMPTY_PANE_VIEWS;
  }

  /** A band on the date strip covering how long the trade runs. */
  timeAxisPaneViews(): readonly IPrimitivePaneView[] {
    return this.activePosition() ? this.timeBandViews : EMPTY_PANE_VIEWS;
  }

  /** Hand the layer a new frame's worth of state and ask for a repaint. */
  update(next: LayerState): void {
    this.state = next;
    this.requestUpdate?.();
  }

  getState(): LayerState {
    return this.state;
  }

  /**
   * Anchor to pixels, or null when either scale cannot place it.
   *
   * Exposed because hit-testing has to measure in exactly the same space the
   * renderer draws in — two implementations would drift apart the moment one of
   * them was tweaked.
   */
  toScreen(anchor: Anchor): Screen | null {
    if (!this.chart || !this.series) return null;

    const logical = timeToLogical(this.state.candles, anchor.time, this.state.timeframe);
    const y = this.series.priceToCoordinate(anchor.price);
    const x = this.logicalToX(logical);
    return x === null || y === null ? null : { x, y };
  }

  /**
   * A fractional logical index in pixels across the pane.
   *
   * `logicalToCoordinate` only answers correctly for whole bars — hand it 74958.01
   * and it returns 0 rather than a point a hundredth of a bar past 74958. Anchors
   * land on fractions all the time (anything between two bars, and anything inside
   * a weekend gap), so the whole part is converted and the remainder is walked out
   * by hand. Getting this wrong pinned a position's far edge to the left of the
   * chart no matter where it was drawn.
   */
  private logicalToX(logical: number): number | null {
    const scale = this.chart?.timeScale();
    if (!scale) return null;

    const whole = Math.floor(logical);
    const frac = logical - whole;

    const at = scale.logicalToCoordinate(whole as Logical);
    if (at === null) return null;
    if (frac <= 0) return at;

    const next = scale.logicalToCoordinate((whole + 1) as Logical);
    if (next !== null) return at + (next - at) * frac;

    // Off the end of the data: fall back to the nominal bar width.
    const spacing = this.chart?.options().timeScale.barSpacing ?? 6;
    return at + spacing * frac;
  }

  /** A price in pixels down the pane, for the axis chips. */
  priceToY(price: number): number | null {
    return this.series?.priceToCoordinate(price) ?? null;
  }

  /** A time in pixels across the pane, for the date-strip chips and band. */
  timeToX(time: number): number | null {
    return this.logicalToX(timeToLogical(this.state.candles, time, this.state.timeframe));
  }

  /** Chart width and height in CSS pixels, used to extend rays and lines. */
  size(): { width: number; height: number } | null {
    if (!this.chart) return null;
    return {
      width: this.chart.timeScale().width(),
      height: this.chart.paneSize().height,
    };
  }
}

const EMPTY_AXIS_VIEWS: readonly ISeriesPrimitiveAxisView[] = [];
const EMPTY_PANE_VIEWS: readonly IPrimitivePaneView[] = [];

/** Tint used for the axis range bands, matching the selection blue. */
const BAND = "rgba(41, 98, 255, 0.22)";

/** One time-axis chip, at an edge of the position. */
class EdgeAxisView implements ISeriesPrimitiveAxisView {
  constructor(
    private readonly layer: DrawingLayer,
    private readonly time: number,
    private readonly back: string,
  ) {}

  coordinate(): number {
    return this.layer.timeToX(this.time) ?? -100;
  }

  text(): string {
    const d = new Date(this.time * 1000);
    const day = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
    const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
    const year = `'${String(d.getUTCFullYear()).slice(2)}`;
    const time = d.toISOString().slice(11, 16);
    return `${day} ${date} ${year} ${time}`;
  }

  textColor(): string {
    return "#ffffff";
  }

  backColor(): string {
    return this.back;
  }
}

/** Shades the reward and risk spans down the price axis. */
class PriceBandView implements IPrimitivePaneView {
  constructor(private readonly layer: DrawingLayer) {}

  renderer(): IPrimitivePaneRenderer | null {
    const active = this.layer.activePosition();
    if (!active) return null;

    const [entry, target, stop] = active.points;
    const ys = [entry, target, stop].map((p) => this.layer.priceToY(p.price));
    if (ys.some((y) => y === null)) return null;
    const [entryY, targetY, stopY] = ys as number[];

    return {
      draw: (renderTarget) => {
        renderTarget.useBitmapCoordinateSpace(
          ({ context: ctx, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
            ctx.save();
            ctx.scale(horizontalPixelRatio, verticalPixelRatio);
            ctx.fillStyle = BAND;
            const width = bitmapSize.width / horizontalPixelRatio;
            for (const [a, b] of [
              [entryY, targetY],
              [entryY, stopY],
            ]) {
              ctx.fillRect(0, Math.min(a, b), width, Math.abs(b - a));
            }
            ctx.restore();
          },
        );
      },
    };
  }
}

/** Shades how long the trade runs, along the date strip. */
class TimeBandView implements IPrimitivePaneView {
  constructor(private readonly layer: DrawingLayer) {}

  renderer(): IPrimitivePaneRenderer | null {
    const active = this.layer.activePosition();
    if (!active) return null;

    const [entry, target] = active.points;
    const a = this.layer.timeToX(entry.time);
    const b = this.layer.timeToX(target.time);
    if (a === null || b === null) return null;

    return {
      draw: (renderTarget) => {
        renderTarget.useBitmapCoordinateSpace(
          ({ context: ctx, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
            ctx.save();
            ctx.scale(horizontalPixelRatio, verticalPixelRatio);
            ctx.fillStyle = BAND;
            ctx.fillRect(
              Math.min(a, b),
              0,
              Math.abs(b - a),
              bitmapSize.height / verticalPixelRatio,
            );
            ctx.restore();
          },
        );
      },
    };
  }
}

/** One price-axis chip, at a level a position cares about. */
class LevelAxisView implements ISeriesPrimitiveAxisView {
  constructor(
    private readonly layer: DrawingLayer,
    private readonly price: number,
    private readonly back: string,
    private readonly fore: string,
  ) {}

  coordinate(): number {
    return this.layer.priceToY(this.price) ?? -100;
  }

  text(): string {
    return this.price.toFixed(5);
  }

  textColor(): string {
    return this.fore;
  }

  backColor(): string {
    return this.back;
  }
}

/**
 * Where a drawing's grab handles sit.
 *
 * Shared by the renderer and the hit-test on purpose: if the circle you can see
 * and the circle you can grab were computed separately, they would drift the
 * first time either was adjusted.
 */
export function handlePoints(drawing: Drawing, screen: Screen[]): Screen[] {
  if (drawing.kind === "long-position" || drawing.kind === "short-position") {
    const [entry, target, stop] = screen;
    const left = Math.min(entry.x, target.x);
    const right = Math.max(entry.x, target.x);
    // Order matters — the drag code reads these positionally:
    // 0 entry price, 1 target price, 2 stop price, 3 right edge.
    //
    // There is deliberately no fifth handle for the left edge. One used to sit
    // at exactly the entry handle's pixel, so hit-testing always matched entry
    // first and the left edge could never be grabbed at all. Widening from the
    // left is done by dragging the box's vertical edge instead — see hit-test.
    return [
      { x: left, y: entry.y },
      { x: left, y: target.y },
      { x: left, y: stop.y },
      { x: right, y: entry.y },
    ];
  }

  return screen;
}

class DrawingPaneView implements IPrimitivePaneView {
  constructor(private readonly layer: DrawingLayer) {}

  renderer(): IPrimitivePaneRenderer | null {
    return new DrawingRenderer(this.layer);
  }
}

class DrawingRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly layer: DrawingLayer) {}

  draw(target: CanvasRenderingTarget2D): void {
    const state = this.layer.getState();
    const size = this.layer.size();
    if (!size) return;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) => {
      ctx.save();
      // Draw in CSS pixels and let the transform handle the device ratio, so a
      // 1px line is a hairline on a retina display instead of a fuzzy 2px one.
      ctx.scale(horizontalPixelRatio, verticalPixelRatio);
      ctx.lineJoin = "round";
      ctx.font = FONT;
      ctx.textBaseline = "middle";

      if (state.guide) this.guides(ctx, state.guide, size);

      for (const drawing of state.drawings) {
        this.paint(ctx, drawing, size, drawing.id === state.selectedId, drawing.id === state.hoveredId);
      }
      if (state.draft) this.paint(ctx, state.draft, size, false, false);

      ctx.restore();
    });
  }

  private paint(
    ctx: CanvasRenderingContext2D,
    drawing: Drawing,
    size: { width: number; height: number },
    selected: boolean,
    hovered: boolean,
  ): void {
    const resolved = drawing.points.map((anchor) => this.layer.toScreen(anchor));
    if (resolved.some((point) => point === null)) return;
    const screen = resolved as Screen[];
    const style = styleOf(drawing);

    ctx.strokeStyle = style.line;
    ctx.lineWidth = style.lineWidth + (hovered && !selected ? 0.5 : 0);
    ctx.setLineDash([]);

    switch (drawing.kind) {
      case "rectangle": {
        const [a, b] = screen;
        const right = style.extend ? size.width : Math.max(a.x, b.x);
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const height = Math.abs(b.y - a.y);

        if (style.showFill) {
          ctx.fillStyle = withAlpha(style.fill, style.fillOpacity);
          ctx.fillRect(x, y, right - x, height);
        }
        // A borderless rectangle is a legitimate look — a zone marked by tint
        // alone — so the outline is skipped rather than drawn transparent.
        if (style.showBorder) ctx.strokeRect(x, y, right - x, height);
        break;
      }

      case "trendline":
        this.trendline(ctx, drawing, screen);
        break;

      case "horizontal-ray":
        // Always runs to the right edge; the anchor is only its start.
        this.line(ctx, screen[0], { x: size.width, y: screen[0].y });
        break;

      case "vertical-line":
        this.line(ctx, { x: screen[0].x, y: 0 }, { x: screen[0].x, y: size.height });
        break;

      case "long-position":
      case "short-position":
        // Labels only while the trade is being worked on. Left permanently on
        // they stack up over the candles and make the chart unreadable, which
        // is exactly why TradingView drops them the moment you click away.
        this.position(ctx, drawing, screen, selected || hovered);
        break;
    }

    if (selected || hovered) this.handles(ctx, handlePoints(drawing, screen));
  }

  /**
   * A line, optionally broken around a label at its midpoint.
   *
   * The gap is cut rather than the text simply drawn on top, so the note stays
   * readable without a plate behind it hiding the candles.
   */
  private trendline(ctx: CanvasRenderingContext2D, drawing: Drawing, screen: Screen[]): void {
    const [a, b] = screen;
    const text = drawing.text?.trim();

    if (!text) {
      this.line(ctx, a, b);
      return;
    }

    const half = ctx.measureText(text).width / 2 + 8;
    const length = Math.hypot(b.x - a.x, b.y - a.y);

    if (length <= half * 2) {
      this.line(ctx, a, b);
    } else {
      const ux = (b.x - a.x) / length;
      const uy = (b.y - a.y) / length;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.line(ctx, a, { x: mid.x - ux * half, y: mid.y - uy * half });
      this.line(ctx, { x: mid.x + ux * half, y: mid.y + uy * half }, b);
    }

    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    ctx.fillStyle = styleOf(drawing).line;
    ctx.textAlign = "center";
    ctx.fillText(text, mid.x, mid.y);
    ctx.textAlign = "left";
  }

  /**
   * The dashed cross that follows a handle being dragged.
   *
   * Full width on purpose: the point of it is to reach back over the candles on
   * the left so a level can be placed against them rather than by eye.
   */
  private guides(
    ctx: CanvasRenderingContext2D,
    at: Screen,
    size: { width: number; height: number },
  ): void {
    ctx.save();
    ctx.strokeStyle = "rgba(150, 156, 170, 0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.moveTo(0, at.y);
    ctx.lineTo(size.width, at.y);
    ctx.moveTo(at.x, 0);
    ctx.lineTo(at.x, size.height);
    ctx.stroke();

    ctx.restore();
  }

  private line(ctx: CanvasRenderingContext2D, a: Screen, b: Screen): void {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  /**
   * A target box and a stop box meeting at the entry line, labelled the way a
   * position is actually read: distance, percent, pips and money.
   *
   * The colours are the trade's, not the drawing's — green means profit here,
   * so they are configured separately from the line colour.
   */
  private position(
    ctx: CanvasRenderingContext2D,
    drawing: Drawing,
    screen: Screen[],
    showLabels: boolean,
  ): void {
    const [entry, target, stop] = screen;
    const style = styleOf(drawing);
    const left = Math.min(entry.x, target.x);
    const right = Math.max(entry.x, target.x);
    const width = Math.max(right - left, 1);

    const targetBox = { top: Math.min(entry.y, target.y), height: Math.abs(target.y - entry.y) };
    const stopBox = { top: Math.min(entry.y, stop.y), height: Math.abs(stop.y - entry.y) };

    ctx.fillStyle = withAlpha(style.targetColor, 0.22);
    ctx.fillRect(left, targetBox.top, width, targetBox.height);
    ctx.fillStyle = withAlpha(style.stopColor, 0.22);
    ctx.fillRect(left, stopBox.top, width, stopBox.height);

    // No outline on the boxes. The fill already states the extent, and a stroke
    // on top of it only competes with the candles inside.

    // The entry sits on the seam between the boxes and is what the other two
    // are measured from, so it gets its own line.
    ctx.strokeStyle = style.line;
    ctx.lineWidth = style.lineWidth;
    this.line(ctx, { x: left, y: entry.y }, { x: right, y: entry.y });

    if (!showLabels) return;

    const stats = positionStats(drawing);
    if (!stats) return;

    const money = (value: number) =>
      value >= 1000 ? Math.round(value).toLocaleString() : value.toFixed(0);

    const targetText = `Target: ${stats.targetOffset.toFixed(5)} (${stats.targetPercent.toFixed(3)}%) ${stats.targetPips.toFixed(1)}, Amount: ${money(stats.targetAmount)}`;
    const stopText = `Stop: ${stats.stopOffset.toFixed(5)} (${stats.stopPercent.toFixed(3)}%) ${stats.stopPips.toFixed(1)}, Amount: ${money(stats.stopAmount)}`;

    const targetY = target.y < entry.y ? targetBox.top - 14 : targetBox.top + targetBox.height + 14;
    const stopY = stop.y > entry.y ? stopBox.top + stopBox.height + 14 : stopBox.top - 14;

    pill(ctx, targetText, left, targetY, style.targetColor, "#ffffff");
    pill(ctx, stopText, left, stopY, style.stopColor, "#ffffff");

    // Only once the box can hold it, so a position being dragged out does not
    // flash a label wider than itself — but low enough that a freshly placed
    // one shows its ratio straight away, which is the whole point of the 1:1.
    const ratio = stats.ratio === null ? "—" : stats.ratio.toFixed(2);
    const summary = [
      `Qty: ${Math.round(stats.quantity).toLocaleString()}`,
      `Risk/reward ratio: ${ratio}`,
    ];
    if (width > 96) {
      // Green on a long, red on a short — the summary states which way the
      // trade is facing. Following the entry line instead would leave it grey
      // and say nothing.
      const facing =
        drawing.kind === "long-position" ? style.targetColor : style.stopColor;
      pill(ctx, summary, left + width / 2, entry.y, withAlpha(facing, 0.92), "#ffffff", "center");
    }
  }

  /**
   * Plain rings, the way TradingView draws them.
   *
   * The entry used to carry a crosshair glyph to say "this one moves the
   * trade". It only read as a decoration that could not be grabbed, so it is
   * gone: every handle now looks identical because every handle behaves alike.
   */
  private handles(ctx: CanvasRenderingContext2D, points: Screen[]): void {
    ctx.strokeStyle = HANDLE_STROKE;
    ctx.lineWidth = 2;
    ctx.fillStyle = "#ffffff";

    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** A rounded chip behind label text, so it survives a busy candle field. */
function pill(
  ctx: CanvasRenderingContext2D,
  text: string | string[],
  x: number,
  y: number,
  background: string,
  color: string,
  align: "left" | "center" = "left",
): void {
  const lines = Array.isArray(text) ? text : [text];
  const lineHeight = 15;
  const padX = 7;
  const padY = 4;

  const width = Math.max(...lines.map((line) => ctx.measureText(line).width)) + padX * 2;
  const height = lines.length * lineHeight + padY * 2 - 3;
  const boxX = align === "center" ? x - width / 2 : x;
  const boxY = y - height / 2;

  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, width, height, 4);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.textAlign = align === "center" ? "center" : "left";
  lines.forEach((line, i) => {
    const lineY = boxY + padY + lineHeight / 2 - 1 + i * lineHeight;
    ctx.fillText(line, align === "center" ? x : boxX + padX, lineY);
  });
  ctx.textAlign = "left";
}

/** Hex to rgba, so one colour choice can serve both a stroke and its fill. */
function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith("rgba")) return hex;
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const int = Number.parseInt(full, 16);
  if (Number.isNaN(int)) return hex;
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}
