import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

export const LOGIN_PATH = "/login";

/** Where to send someone after they sign in, if they did not deep-link. */
export const HOME_PATH = "/";

/**
 * Only a path on this same site is ever followed after login. Anything else —
 * `//evil.example`, `https://…`, a missing value — falls back to Home, so the
 * `?next=` parameter cannot be turned into an open redirect.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return HOME_PATH;
  return value;
}

/**
 * Refresh the session on every request, and keep signed-out visitors on the
 * login page.
 *
 * The dance with `response` is what makes the refresh stick: a rotated token has
 * to be written onto the request (so the page that renders next sees it) *and*
 * onto the response (so the browser stores it). Returning a different response
 * object than the one Supabase wrote its cookies to silently signs the user out
 * a token-lifetime later.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // Nothing to guard yet — the app renders its own "connect Supabase" notice.
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Nothing between the client and this call: `getClaims` is what refreshes an
  // expiring token, and any await slipped in front of it can race the refresh.
  //
  // `getClaims` rather than `getSession`, because a session read straight out of
  // a cookie is unverified — it is the claim, not the proof.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const onLogin = pathname === LOGIN_PATH;

  if (!signedIn && !onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    // Deep links survive the detour: /analytics comes back as /analytics.
    if (pathname !== HOME_PATH) url.searchParams.set("next", pathname);
    return withCookies(NextResponse.redirect(url), response);
  }

  if (signedIn && onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = safeNextPath(url.searchParams.get("next"));
    url.search = "";
    return withCookies(NextResponse.redirect(url), response);
  }

  return response;
}

/** Carry a refreshed token onto a redirect, which starts with no cookies. */
function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}
