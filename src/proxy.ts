import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets, PWA files and the cron endpoint (it has its own secret).
    "/((?!_next/static|_next/image|api/cron|sw\\.js|manifest\\.webmanifest|icons/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
