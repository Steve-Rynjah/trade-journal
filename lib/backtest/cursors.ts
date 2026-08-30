/**
 * The pointer modes, and what each one means for the drawings underneath.
 *
 * The two jobs fight over the same click. Reading the chart wants the pointer
 * to pass *through* a marked-up zone — the crosshair should cross a rectangle
 * and keep reporting price, and a drag from inside it should pan the chart,
 * not drag the zone off by three pips. Editing wants the shape grabbable.
 *
 * So Cross passes through a shape's *interior* only: its outline, its lines
 * and its handles stay live, and the pointer turns into an arrow over them to
 * say so. Arrow makes the whole shape grabbable, interior included.
 */
export type CursorKind = "cross" | "arrow";

export const CURSOR_LABEL: Record<CursorKind, string> = {
  cross: "Cross",
  arrow: "Arrow",
};

export const DEFAULT_CURSOR: CursorKind = "cross";

/**
 * True when only a drawing's edges answer to the pointer, not its fill.
 *
 * This is the whole behavioural difference between the two modes, so it is
 * threaded straight into the hit test rather than gating it on or off.
 */
export function edgesOnly(kind: CursorKind): boolean {
  return kind === "cross";
}

/** The CSS `cursor` value for a mode, over anything but a drawing. */
export function cursorCss(kind: CursorKind): string {
  return kind === "cross" ? "crosshair" : "default";
}

const KEY = "fx.backtest.cursor";

/**
 * The remembered mode. Guarded the same way the theme is: private windows and
 * blocked site data make localStorage throw, and a pointer preference is not
 * worth failing a render over.
 */
export function loadCursor(): CursorKind {
  try {
    const raw = window.localStorage.getItem(KEY);
    // Anything else — including "dot", which this build no longer offers —
    // falls back rather than leaving the chart in a mode with no button.
    return raw === "cross" || raw === "arrow" ? raw : DEFAULT_CURSOR;
  } catch {
    return DEFAULT_CURSOR;
  }
}

export function saveCursor(kind: CursorKind): void {
  try {
    window.localStorage.setItem(KEY, kind);
  } catch {
    /* nothing to store into */
  }
}
