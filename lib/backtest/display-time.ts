/**
 * What the clock on the chart says.
 *
 * Every timestamp in this app is real UTC epoch seconds — the packed candle
 * file, the drawing anchors in the database, the replay cursor. That never
 * changes. This module exists only so the *axis* can read in the timezone the
 * person actually trades in, which for this journal is Kolkata.
 *
 * The alternative — adding the offset to the candle times before handing them
 * to the chart — is the more common trick and it would also fix where the
 * date ticks land, but it would silently move every drawing already saved
 * against a real timestamp. Formatting is the only layer that shifts.
 */

/** Minutes east of UTC that the chart reads in. IST is +05:30. */
export const DISPLAY_OFFSET_MINUTES = 330;

const DISPLAY_OFFSET_SECONDS = DISPLAY_OFFSET_MINUTES * 60;

/**
 * A `Date` whose *UTC* getters read as the display zone.
 *
 * Only ever used for formatting. Never hand one of these back to anything that
 * expects a real instant — it is deliberately the wrong moment in time.
 */
function shifted(timeSeconds: number): Date {
  return new Date((timeSeconds + DISPLAY_OFFSET_SECONDS) * 1000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `14:35` in the display zone. */
export function displayClock(timeSeconds: number): string {
  const d = shifted(timeSeconds);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** `29 Aug` in the display zone. */
export function displayDate(timeSeconds: number): string {
  const d = shifted(timeSeconds);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`;
}

/** `Fri 29 Aug '26 14:35` — the long form for an axis chip. */
export function displayStamp(timeSeconds: number): string {
  const d = shifted(timeSeconds);
  const day = DAYS[d.getUTCDay()];
  const year = `'${String(d.getUTCFullYear()).slice(2)}`;
  return `${day} ${displayDate(timeSeconds)} ${year} ${displayClock(timeSeconds)}`;
}

/**
 * The axis tick text, given what weight the library assigned the tick.
 *
 * The tick *positions* are still chosen against UTC day boundaries, so a date
 * tick lands 5½ hours into the IST day rather than at its start. The date it
 * prints is nonetheless the correct IST date, which is what the label is for.
 */
export function displayTickMark(timeSeconds: number, kind: number): string {
  const d = shifted(timeSeconds);
  // TickMarkType: 0 Year, 1 Month, 2 DayOfMonth, 3 Time, 4 TimeWithSeconds.
  if (kind === 0) return String(d.getUTCFullYear());
  if (kind === 1) return MONTHS[d.getUTCMonth()];
  if (kind === 2) return displayDate(timeSeconds);
  return displayClock(timeSeconds);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
