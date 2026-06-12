import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

/**
 * Refresh the Supabase auth session on every request and enforce route
 * protection. Called from `proxy.ts` (Next.js 16's renamed middleware).
 *
 * We mutate cookies on the `response` produced by next-intl so both the locale
 * routing and the refreshed session cookies survive in a single response.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse
): Promise<NextResponse> {
  // If Supabase isn't configured yet (placeholder env), skip silently so the
  // app still renders during local scaffolding.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || url.includes("your-project")) {
    return guardProtectedRoutes(request, response, null);
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return guardProtectedRoutes(request, response, user?.id ?? null);
}

/** Redirect unauthenticated users away from `/[locale]/dashboard/**`. */
function guardProtectedRoutes(
  request: NextRequest,
  response: NextResponse,
  userId: string | null
): NextResponse {
  const { pathname } = request.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const maybeLocale = segments[0];
  const locale = routing.locales.includes(maybeLocale as never)
    ? maybeLocale
    : routing.defaultLocale;
  const rest = routing.locales.includes(maybeLocale as never)
    ? segments.slice(1)
    : segments;

  const isProtected = rest[0] === "dashboard" || rest[0] === "onboarding";

  if (isProtected && !userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${locale}/login`;
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
