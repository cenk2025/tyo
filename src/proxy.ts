import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 `proxy` (formerly `middleware`). Runs next-intl locale routing
 * first, then refreshes the Supabase session and guards protected routes,
 * reusing the response next-intl produced so locale + auth cookies coexist.
 */
const handleI18n = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = handleI18n(request);
  return updateSession(request, response);
}

export const config = {
  // Skip static assets, image optimization, API routes, and files with an
  // extension. Everything else (pages) runs through locale + auth handling.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
