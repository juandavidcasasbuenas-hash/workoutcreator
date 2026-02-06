import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, logo.svg, and other static assets
     * - /api/* routes (they handle auth independently)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|logo\\.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api/).*)",
  ],
};
