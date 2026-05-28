import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getSessionCookieName, isAuthEnabled, decryptSession } from "@/lib/auth"

export async function middleware(request: NextRequest) {
  // Only apply to routes that need protection
  // By default, we want to protect the dashboard routes, but allow API routes and static assets.
  const { pathname } = request.nextUrl

  // Ignore _next, favicon, etc.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next()
  }

  // Allow access to login page
  if (pathname === "/login") {
    return NextResponse.next()
  }

  // Allow access to all API routes (API routes should implement their own auth checks if needed)
  if (pathname.startsWith("/api")) {
    // Optionally: protect specific API routes here if needed
    // But currently, the API routes are accessed by the dashboard or external tools
    return NextResponse.next()
  }

  // If auth is not enabled (no password set), allow access
  if (!isAuthEnabled()) {
    return NextResponse.next()
  }

  // Verify JWT session
  const token = request.cookies.get(getSessionCookieName())?.value

  if (!token) {
    // No token, redirect to login
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  const session = await decryptSession(token)

  if (!session || !session.authenticated) {
    // Invalid or expired token, redirect to login
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
}
