import "server-only";

/**
 * The OpenRouter call, kept apart from the prompt and the parsing so the one
 * piece that talks to the network is also the one piece with no opinions about
 * trading in it.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Overridable because the default is a free model on a shared upstream pool:
 * when Google AI Studio is saturated every free caller gets 429 at once, and
 * switching to another model should not need a code change.
 */
export const MODEL = process.env.OPENROUTER_MODEL ?? "google/gemma-4-31b-it:free";

/**
 * Who answers when the model above cannot.
 *
 * Gemma's free tier is served by one provider out of a pool every free caller
 * on OpenRouter shares, and it spends hours at a time returning 429. Rather
 * than dead-ending the tab, the request carries a list and OpenRouter routes
 * past whatever is busy — the reply says which model actually answered, and
 * the report footer prints it, so a substitution is never silent.
 *
 * Both were picked by testing: each returns well-formed JSON for this prompt.
 * The sibling Gemma goes first, being the nearest thing to what was asked for.
 * Set OPENROUTER_FALLBACKS to a comma-separated list to change them, or to an
 * empty value to insist on the primary model alone.
 */
const DEFAULT_FALLBACKS = ["google/gemma-4-26b-a4b-it:free", "nex-agi/nex-n2.5-pro:free"];

/** OpenRouter rejects a longer list outright: "must have 3 items or fewer". */
const MAX_ROUTE = 3;

const FALLBACKS = (process.env.OPENROUTER_FALLBACKS ?? DEFAULT_FALLBACKS.join(","))
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name !== "" && name !== MODEL);

/** The primary first: OpenRouter tries them in order and stops at the first that answers. */
const ROUTE = [MODEL, ...FALLBACKS].slice(0, MAX_ROUTE);

/**
 * Read per call, not once at import: a module-level constant is fixed for the
 * life of the server instance, so a key added to the deployment afterwards
 * would stay invisible until the next cold start.
 */
export function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * Where the key is meant to be set. `.env.local` is never deployed — it is
 * gitignored — so on Vercel the same advice would send you to the wrong place.
 */
const ENV_HOME = process.env.VERCEL
  ? "the Vercel project's Environment Variables (then redeploy)"
  : ".env.local (then restart the dev server)";

export const MISSING_KEY_ERROR = `No OPENROUTER_API_KEY set — add it to ${ENV_HOME}.`;

export type ChatResult =
  | { ok: true; content: string; model: string }
  | { ok: false; error: string; retryable: boolean };

/** Free pools clear in seconds, so a couple of spaced retries is usually enough. */
const ATTEMPTS = 3;
const BACKOFF_MS = [1200, 3000];

/**
 * Generous because reasoning tokens are billed against the same ceiling: a
 * model that thinks before answering spent the whole of a 2400 budget on the
 * thinking and returned nothing. The report itself is ~1500 tokens of JSON.
 */
const MAX_TOKENS = 8000;

export async function chat(
  system: string,
  user: string,
  maxTokens = MAX_TOKENS,
): Promise<ChatResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return {
      ok: false,
      retryable: false,
      error: MISSING_KEY_ERROR,
    };
  }

  let last: ChatResult = { ok: false, retryable: true, error: "The model did not answer." };

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    last = await once(key, system, user, maxTokens);
    if (last.ok || !last.retryable) return last;

    const wait = BACKOFF_MS[attempt];
    if (wait === undefined) break;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  return last;
}

async function once(
  key: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<ChatResult> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Optional on OpenRouter, but they are what a key's usage is grouped
        // under on the dashboard — worth setting while there is one app using it.
        "HTTP-Referer": process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : "http://localhost:3000",
        "X-Title": "Trade Journal",
      },
      body: JSON.stringify({
        model: MODEL,
        // Fallback routing, handled by OpenRouter in the one request.
        ...(ROUTE.length > 1 ? { models: ROUTE } : {}),
        // Low, not zero: the same sheet should read the same way twice, but a
        // review written at 0 repeats its own phrasing across sections.
        temperature: 0.3,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        // The default model does not reason out loud, but an override might:
        // on a reasoning model the thinking lands in `content` (or eats the
        // whole token budget and leaves it empty), and either way there is no
        // JSON at the end of it. Ignored by models without the feature.
        reasoning: { exclude: true },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      // A free model behind a shared pool can sit for a while before answering.
      signal: AbortSignal.timeout(90_000),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.error) {
      const code = payload?.error?.code ?? response.status;
      const raw = payload?.error?.metadata?.raw;
      const message =
        typeof raw === "string" && raw.trim() !== ""
          ? raw
          : (payload?.error?.message ?? `OpenRouter returned ${response.status}.`);

      return { ok: false, retryable: code === 429 || code >= 500, error: describe(code, message) };
    }

    const choice = payload?.choices?.[0];
    const content = choice?.message?.content;

    // Checked before the answer itself, because it explains an empty one: a
    // model that thinks out loud can spend the whole budget reasoning and
    // return nothing at all. `reasoning.exclude` hides that text but does not
    // stop it being generated, so the cure is a different model, not a retry.
    if (choice?.finish_reason === "length") {
      return {
        ok: false,
        retryable: true,
        error: `${MODEL} ran out of room before finishing the report. Try again, or set OPENROUTER_MODEL to a model that does not reason out loud.`,
      };
    }

    if (typeof content !== "string" || content.trim() === "") {
      return { ok: false, retryable: true, error: "The model returned an empty answer." };
    }

    return { ok: true, content, model: payload?.model ?? MODEL };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      retryable: true,
      error: timedOut
        ? "The model took too long to answer. Try again."
        : `Could not reach OpenRouter: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}

/** Turns the two failures worth acting on into instructions. */
function describe(code: number | string, message: string): string {
  if (code === 429) {
    return ROUTE.length > 1
      ? `Every free model tried is busy right now — they share one upstream pool. Try again in a moment, or set OPENROUTER_MODEL in ${ENV_HOME} to a model with capacity.`
      : `${MODEL} is busy — free models share one upstream pool. Try again in a moment, or set OPENROUTER_MODEL in ${ENV_HOME} to a model with capacity.`;
  }
  if (code === 401 || code === 403) {
    return `OpenRouter rejected the key. Check OPENROUTER_API_KEY in ${ENV_HOME}.`;
  }
  return message;
}
