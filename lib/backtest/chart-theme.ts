/**
 * How the chart itself looks — the canvas and the candles.
 *
 * Kept apart from the drawing styles: this is the surface everything else is
 * drawn on, it belongs to the person rather than to any one session, and it is
 * remembered in the browser rather than the database for that reason.
 */

export type ChartTheme = {
  background: string;
  grid: string;
  showGrid: boolean;

  /** The rules that fence off the price axis and the date strip. */
  scaleLine: string;
  showScaleLines: boolean;
  /** Axis label colour, for both the prices and the dates. */
  scaleText: string;

  /**
   * Candle colours may be hex or rgba. The alpha lives in the colour itself so
   * every element — each body, border and wick — can be faded on its own.
   */
  upColor: string;
  downColor: string;
  showBorders: boolean;
  upBorder: string;
  downBorder: string;
  showWicks: boolean;
  upWick: string;
  downWick: string;

  /** Percentages of the pane kept clear above and below the price action. */
  marginTop: number;
  marginBottom: number;
  /** Empty bars kept to the right of the last candle. */
  rightOffset: number;
};

/** TradingView's own dark palette, which is what the reference screenshots use. */
export const DARK_THEME: ChartTheme = {
  background: "#131722",
  grid: "#1e222d",
  showGrid: true,
  scaleLine: "#2a2e39",
  showScaleLines: true,
  scaleText: "#b2b5be",
  upColor: "#089981",
  downColor: "#f23645",
  showBorders: true,
  upBorder: "#089981",
  downBorder: "#f23645",
  showWicks: true,
  upWick: "#089981",
  downWick: "#f23645",
  marginTop: 10,
  marginBottom: 8,
  rightOffset: 12,
};

export const LIGHT_THEME: ChartTheme = {
  ...DARK_THEME,
  background: "#ffffff",
  grid: "#f2f4f7",
  scaleLine: "#e4e7ec",
  scaleText: "#475467",
};

const KEY = "backtest.chart-theme";

/**
 * Reads the saved appearance, falling back to the palette for the active mode.
 *
 * Every access is guarded: private windows and blocked site data both make
 * localStorage throw rather than return null, and a chart that will not render
 * because of a colour preference would be a poor trade.
 */
export function loadTheme(dark: boolean): ChartTheme {
  const base = dark ? DARK_THEME : LIGHT_THEME;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<ChartTheme>;
    return { ...base, ...saved };
  } catch {
    return base;
  }
}

export function saveTheme(theme: ChartTheme): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(theme));
  } catch {
    // A preference that cannot be stored is not worth failing a render over.
  }
}

export function clearTheme(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to undo */
  }
}
