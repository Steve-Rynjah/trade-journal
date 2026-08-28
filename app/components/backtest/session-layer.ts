/**
 * Paints the Session Indicator onto the chart's own canvas.
 *
 * Built as a lightweight-charts primitive for the same reason the drawing layer
 * is: the library calls us inside the frame it draws the candles, so a session
 * box can never lag a pixel behind the bar it belongs to.
 *
 * Two pane views rather than one. The shaded ranges sit at `zOrder: "bottom"`,
 * underneath the candles, because a translucent block painted over them washes
 * the wicks out — TradingView puts its `fill()` under the series too. Outlines,
 * levels and labels sit at `normal`, above.
 */

import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

import type { Candle, Timeframe } from "@/lib/backtest/candles";
import { timeToLogical } from "@/lib/backtest/drawings";
import {
  SESSION_TAG,
  TEXT_PX,
  adrDayOf,
  clampSessions,
  dashFor,
  type LevelConfig,
  type LevelLine,
  type SessionData,
  type SessionRange,
  type SessionSettings,
} from "@/lib/backtest/session-indicator";

export type SessionLayerState = {
  /** Folded against the whole series, independent of where replay has got to. */
  data: SessionData;
  settings: SessionSettings;
  candles: Candle[];
  timeframe: Timeframe;
  /** Time of the newest candle on screen. Nothing past it may be drawn. */
  cutoff: number;
};

const EMPTY: SessionData = {
  ranges: [],
  extensions: [],
  previousDay: [],
  lastWeek: [],
  thisWeek: [],
  adr: new Map(),
};

const FONT = "Outfit, ui-sans-serif, system-ui, sans-serif";

export class SessionLayer implements ISeriesPrimitive<Time> {
  private state: SessionLayerState | null = null;
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType, Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  /** The clamp is pure, so one result per cutoff is all that is ever needed. */
  private clamped: { cutoff: number; data: SessionData } | null = null;

  private readonly views: IPrimitivePaneView[] = [
    new SessionPaneView(this, "bottom"),
    new SessionPaneView(this, "normal"),
  ];

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

  update(next: SessionLayerState): void {
    const changed =
      this.state === null ||
      this.state.data !== next.data ||
      this.state.cutoff !== next.cutoff;
    this.state = next;
    if (changed) this.clamped = null;
    this.requestUpdate?.();
  }

  getState(): SessionLayerState | null {
    return this.state;
  }

  data(): SessionData {
    const state = this.state;
    if (!state) return EMPTY;
    if (this.clamped?.cutoff !== state.cutoff) {
      this.clamped = { cutoff: state.cutoff, data: clampSessions(state.data, state.cutoff) };
    }
    return this.clamped.data;
  }

  /**
   * A time in pixels across the pane.
   *
   * Same fractional walk the drawing layer does, and for the same reason:
   * `logicalToCoordinate` only answers correctly for whole bars, and a session
   * boundary lands between two of them almost every time.
   */
  timeToX(time: number): number | null {
    const state = this.state;
    const scale = this.chart?.timeScale();
    if (!state || !scale) return null;

    const logical = timeToLogical(state.candles, time, state.timeframe);
    const whole = Math.floor(logical);
    const frac = logical - whole;

    const at = scale.logicalToCoordinate(whole as Logical);
    if (at === null) return null;
    if (frac <= 0) return at;

    const next = scale.logicalToCoordinate((whole + 1) as Logical);
    if (next !== null) return at + (next - at) * frac;

    const spacing = this.chart?.options().timeScale.barSpacing ?? 6;
    return at + spacing * frac;
  }

  priceToY(price: number): number | null {
    return this.series?.priceToCoordinate(price) ?? null;
  }

  size(): { width: number; height: number } | null {
    if (!this.chart) return null;
    return { width: this.chart.timeScale().width(), height: this.chart.paneSize().height };
  }

  /**
   * The span of time currently on screen, in epoch seconds.
   *
   * Everything the renderer draws is culled against this. Two years of 5-minute
   * candles is over five hundred session boxes, and painting the ones scrolled
   * off the side costs a frame for nothing.
   */
  visibleTimes(): { from: number; to: number } | null {
    const state = this.state;
    const scale = this.chart?.timeScale();
    if (!state || !scale || state.candles.length === 0) return null;

    const range = scale.getVisibleLogicalRange();
    if (!range) return null;

    const candles = state.candles;
    const at = (logical: number) => {
      const clamped = Math.max(0, Math.min(candles.length - 1, Math.round(logical)));
      return candles[clamped].time;
    };

    // Padded by a day so a box that starts off-screen still draws the part of
    // itself that is on-screen, rather than popping in at its left edge.
    return { from: at(range.from) - 86_400, to: at(range.to) + 86_400 };
  }
}

/** Turns `#2962ff` plus an opacity into a canvas fill. */
function tint(color: string, opacity: number): string {
  const hex = color.trim();
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) {
    // Already rgba() or a named colour — use it as it stands rather than
    // guessing, so a hand-typed value never silently paints black.
    return hex;
  }
  const full =
    hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

class SessionPaneView implements IPrimitivePaneView {
  constructor(
    private readonly layer: SessionLayer,
    private readonly order: PrimitivePaneViewZOrder,
  ) {}

  zOrder(): PrimitivePaneViewZOrder {
    return this.order;
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (!this.layer.getState()) return null;
    return this.order === "bottom"
      ? new FillRenderer(this.layer)
      : new OutlineRenderer(this.layer);
  }
}

/** The staircase shading, under the candles. */
class FillRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly layer: SessionLayer) {}

  draw(target: CanvasRenderingTarget2D): void {
    const state = this.layer.getState();
    const visible = this.layer.visibleTimes();
    if (!state || !visible) return;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) => {
      ctx.save();
      ctx.scale(horizontalPixelRatio, verticalPixelRatio);

      for (const range of this.layer.data().ranges) {
        if (range.end < visible.from || range.start > visible.to) continue;
        const config = state.settings.sessions[range.key];
        if (config.fillOpacity <= 0) continue;

        // One polygon: along the running high left to right, back along the
        // running low. Drawing a rectangle per candle instead leaves hairline
        // seams between them wherever the device pixel ratio is fractional.
        const top: { x: number; y: number }[] = [];
        const bottom: { x: number; y: number }[] = [];

        for (const step of range.steps) {
          const x = this.layer.timeToX(step.time);
          const high = this.layer.priceToY(step.high);
          const low = this.layer.priceToY(step.low);
          if (x === null || high === null || low === null) continue;
          top.push({ x, y: high });
          bottom.push({ x, y: low });
        }

        if (top.length < 2) continue;

        ctx.beginPath();
        ctx.moveTo(top[0].x, top[0].y);
        // Square corners, not diagonals: the range only changes when a candle
        // closes, so the edge steps rather than slopes.
        for (let i = 1; i < top.length; i++) {
          ctx.lineTo(top[i].x, top[i - 1].y);
          ctx.lineTo(top[i].x, top[i].y);
        }
        for (let i = bottom.length - 1; i > 0; i--) {
          ctx.lineTo(bottom[i].x, bottom[i].y);
          ctx.lineTo(bottom[i].x, bottom[i - 1].y);
        }
        ctx.lineTo(bottom[0].x, bottom[0].y);
        ctx.closePath();

        ctx.fillStyle = tint(config.fill, config.fillOpacity);
        ctx.fill();
      }

      ctx.restore();
    });
  }
}

/** Boxes, levels and labels, over the candles. */
class OutlineRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly layer: SessionLayer) {}

  draw(target: CanvasRenderingTarget2D): void {
    const state = this.layer.getState();
    const visible = this.layer.visibleTimes();
    const size = this.layer.size();
    if (!state || !visible || !size) return;

    const data = this.layer.data();
    const settings = state.settings;

    target.useBitmapCoordinateSpace(({ context: ctx, horizontalPixelRatio, verticalPixelRatio }) => {
      ctx.save();
      ctx.scale(horizontalPixelRatio, verticalPixelRatio);
      // The price axis is a separate pane; anything past it would paint over
      // the scale.
      ctx.beginPath();
      ctx.rect(0, 0, size.width, size.height);
      ctx.clip();

      this.levels(ctx, data.previousDay, settings.previousDay, visible, size.width);
      this.levels(ctx, data.lastWeek, settings.lastWeek, visible, size.width);
      this.levels(ctx, data.thisWeek, settings.thisWeek, visible, size.width);

      for (const range of data.ranges) {
        if (range.end < visible.from || range.start > visible.to) continue;
        this.box(ctx, range, settings);
      }

      // Only the Asian levels run on, and only while the extension window is
      // still ahead of the candles being shown.
      const asian = settings.sessions.asian;
      if (asian.show) {
        for (const extension of data.extensions) {
          if (extension.end < visible.from || extension.start > visible.to) continue;
          const x1 = this.layer.timeToX(extension.start);
          const x2 = this.layer.timeToX(extension.end);
          if (x1 === null || x2 === null) continue;

          for (const [price, color, style] of [
            [extension.high, asian.border, asian.lineStyle],
            [extension.low, asian.border, asian.lineStyle],
            [extension.mid, asian.midColor, asian.midStyle],
          ] as [number, string, typeof asian.lineStyle][]) {
            const y = this.layer.priceToY(price);
            if (y === null) continue;
            stroke(ctx, x1, y, x2, y, color, asian.lineWidth, style);
          }
        }
      }

      for (const range of data.ranges) {
        if (range.end < visible.from || range.start > visible.to) continue;
        this.rangeLabel(ctx, range, settings, data);
      }

      ctx.restore();
    });
  }

  /** Yesterday's / last week's high and low, plus their axis-side tags. */
  private levels(
    ctx: CanvasRenderingContext2D,
    lines: LevelLine[],
    config: LevelConfig,
    visible: { from: number; to: number },
    width: number,
  ): void {
    if (!config.show) return;

    for (const line of lines) {
      if (line.end < visible.from || line.start > visible.to) continue;
      const x1 = this.layer.timeToX(line.start);
      const x2 = this.layer.timeToX(line.end);
      const y = this.layer.priceToY(line.price);
      if (x1 === null || x2 === null || y === null) continue;

      stroke(ctx, x1, y, x2, y, config.color, config.width, config.style);

      if (config.showLabel && x2 > 0 && x1 < width) {
        ctx.font = `${TEXT_PX.small}px ${FONT}`;
        ctx.fillStyle = config.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(line.label, Math.max(x1, 0) + 4, y - 2);
      }
    }
  }

  /** The rectangle at the session's final high and low, plus its mid line. */
  private box(
    ctx: CanvasRenderingContext2D,
    range: SessionRange,
    settings: SessionSettings,
  ): void {
    const config = settings.sessions[range.key];
    const left = this.layer.timeToX(range.start);
    // A range still forming stops at its newest candle rather than reaching out
    // to a close that has not happened.
    const lastStep = range.steps[range.steps.length - 1];
    const right = this.layer.timeToX(range.complete ? range.end : lastStep.time);
    const top = this.layer.priceToY(range.high);
    const bottom = this.layer.priceToY(range.low);
    const mid = this.layer.priceToY(range.mid);
    if (left === null || right === null || top === null || bottom === null) return;

    stroke(ctx, left, top, right, top, config.border, config.boxWidth, config.boxStyle);
    stroke(ctx, left, bottom, right, bottom, config.border, config.boxWidth, config.boxStyle);
    stroke(ctx, left, top, left, bottom, config.border, config.boxWidth, config.boxStyle);
    stroke(ctx, right, top, right, bottom, config.border, config.boxWidth, config.boxStyle);

    if (mid !== null) {
      stroke(ctx, left, mid, right, mid, config.midColor, config.lineWidth, config.midStyle);
    }
  }

  /** `A = 7.5`, with the ADR under it when this day carries a reading. */
  private rangeLabel(
    ctx: CanvasRenderingContext2D,
    range: SessionRange,
    settings: SessionSettings,
    data: SessionData,
  ): void {
    const config = settings.sessions[range.key];
    if (!config.showRange || !range.complete) return;

    const left = this.layer.timeToX(range.start);
    const right = this.layer.timeToX(range.end);
    const y = this.layer.priceToY(range.low);
    if (left === null || right === null || y === null) return;

    const lines = [`${SESSION_TAG[range.key]} = ${range.pips.toFixed(1)}`];
    // The ADR belongs to the day, not the session, so it is only tagged onto
    // the Asian label — three copies of the same number reads as three numbers.
    const adr = settings.showAdr && range.key === "asian" ? data.adr.get(adrDayOf(range.start)) : undefined;
    if (adr !== undefined) lines.push(`ADR = ${adr}`);

    const px = TEXT_PX[config.textSize];
    ctx.font = `${px}px ${FONT}`;
    ctx.fillStyle = config.textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const centre = (left + right) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, centre, y + 6 + i * (px + 2));
    });
  }
}

/** One straight line in the given style, then the dash pattern put back. */
function stroke(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  style: Parameters<typeof dashFor>[0],
): void {
  if (width <= 0) return;
  ctx.beginPath();
  ctx.setLineDash(dashFor(style, width));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
}
