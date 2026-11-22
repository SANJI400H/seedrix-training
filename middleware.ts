import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { isAdminPath, portalMiddleware } from "./lib/portal/middleware";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // Staff portal: English only, no locale prefix, requires a signed-in user.
  if (isAdminPath(request.nextUrl.pathname)) {
    return portalMiddleware(request);
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(ar|en)/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
