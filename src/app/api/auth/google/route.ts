/**
 * app/api/auth/google/route.ts
 *
 * GET /api/auth/google
 *
 * Initiates Google OAuth flow. Redirects user to Google's consent screen.
 * Optional query: ?redirect=/dashboard (where to send user after sign-in)
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getGoogleOAuthRedirectUri } from "@/lib/appBaseUrl";
import { getGoogleAuthUrl } from "@/services/auth/google";
import { serializeOAuthStateCookie } from "@/services/auth/cookies";

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const redirectTo = searchParams.get("redirect") ?? "/";

    // Validate redirect is same-origin path (prevent open redirect)
    if (!redirectTo.startsWith("/") || redirectTo.includes("//")) {
        return new NextResponse("Invalid redirect", { status: 400 });
    }
    const state = randomBytes(24).toString("hex");
    const redirectUri = getGoogleOAuthRedirectUri();

    const authUrl = getGoogleAuthUrl(redirectUri, `${state}:${redirectTo}`);

    const response = new NextResponse(null, { status: 302 });
    response.headers.set("Location", authUrl);
    response.headers.append("Set-Cookie", serializeOAuthStateCookie(`${state}:${redirectTo}`));

    return response;
}
