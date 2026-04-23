import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Protected routes: redirect to login if not authenticated
  const protectedPaths = ["/dashboard", "/campaigns", "/reporting", "/billing", "/inventory", "/settings", "/onboarding", "/admin"];
  if (protectedPaths.some((p) => path.startsWith(p)) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Admin routes: require admin role
  if (path.startsWith("/admin") && user) {
    const isAdmin = user.app_metadata?.role === "admin";
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  // Auth pages: redirect to appropriate dashboard if already authenticated
  // Exception: /auth/reset-password needs an active session to call updateUser
  if (path.startsWith("/auth/") && user && path !== "/auth/reset-password") {
    const url = request.nextUrl.clone();
    const isAdmin = user.app_metadata?.role === "admin";
    url.pathname = isAdmin ? "/admin/dashboard" : "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/campaigns/:path*",
    "/reporting/:path*",
    "/billing/:path*",
    "/inventory/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/auth/:path*",
    "/admin/:path*",
  ],
};
