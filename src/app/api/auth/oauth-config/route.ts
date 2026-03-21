/**
 * GET /api/auth/oauth-config
 *
 * Development helper: shows the exact Google OAuth redirect URI this server uses.
 * Compare with Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs.
 */
import { NextResponse } from "next/server";
import { getGoogleOAuthRedirectUri, getResolvedAppBaseUrl } from "@/lib/appBaseUrl";

export async function GET() {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
        appBaseUrl: getResolvedAppBaseUrl(),
        googleRedirectUri: getGoogleOAuthRedirectUri(),
        hint: "Add googleRedirectUri exactly (character-for-character) under Authorized redirect URIs for the same GOOGLE_CLIENT_ID.",
    });
}
