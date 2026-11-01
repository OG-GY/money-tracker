import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./env";

// /api routes check the session themselves and answer 401 in JSON.
const PUBLIC_PATHS = ["/login", "/auth", "/offline", "/api"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and gates the app:
 * signed-out visitors go to /login, signed-in visitors skip /login.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    // Lets the shell render locally before Supabase is set up.
    return response;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims().
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const { pathname } = request.nextUrl;

  const allowed = process.env.ALLOWED_EMAIL?.toLowerCase();
  if (claims && allowed && String(claims.email).toLowerCase() !== allowed) {
    await supabase.auth.signOut();
    return redirectTo(request, response, "/login?error=not-allowed");
  }

  if (!claims && !isPublic(pathname)) {
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return redirectTo(request, response, `/login${next}`);
  }

  if (claims && pathname === "/login") {
    return redirectTo(request, response, "/");
  }

  return response;
}

// Carry refreshed auth cookies over to the redirect response.
function redirectTo(request: NextRequest, from: NextResponse, path: string) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
