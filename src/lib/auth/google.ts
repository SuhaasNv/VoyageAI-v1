/**
 * lib/auth/google.ts
 *
 * Google OAuth 2.0 – Authorization Code flow.
 * Used for server-side sign-in with Google.
 */

import { logError } from "@/lib/logger";
import jwt from "jsonwebtoken";
import dns from "node:dns";

// Fix Node fetch IPv6 latency issue where it stalls for 3 seconds before falling back mapping to IPv4.
if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
}

const GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";

const SCOPES = ["openid", "email", "profile"];

function requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
}

export interface GoogleUserInfo {
    id: string;
    email: string;
    name?: string;
    picture?: string;
    verified_email: boolean;
}

/**
 * Build the Google OAuth authorization URL.
 * Redirect the user here to start the sign-in flow.
 */
export function getGoogleAuthUrl(redirectUri: string, state: string): string {
    const clientId = requireEnv("GOOGLE_CLIENT_ID");
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        state,
        access_type: "offline",
        prompt: "select_account",
    });
    return `${GOOGLE_AUTH_URI}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens, then extract user info from the id_token.
 * This avoids an extra network request to the userinfo endpoint, reducing latency.
 */
export async function exchangeCodeForUserInfo(
    code: string,
    redirectUri: string
): Promise<GoogleUserInfo> {
    const clientId = requireEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");

    const tokenRes = await fetch(GOOGLE_TOKEN_URI, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
        }),
    });

    if (!tokenRes.ok) {
        const err = await tokenRes.text();
        logError("[google] Token exchange failed", { status: tokenRes.status, err });
        throw new Error("Google sign-in failed. Please try again.");
    }

    const tokens = (await tokenRes.json()) as {
        access_token?: string;
        id_token?: string;
        error?: string;
    };

    const idToken = tokens.id_token;
    if (!idToken) {
        logError("[google] No id_token in response", { tokens });
        throw new Error("Google sign-in failed. Please try again.");
    }

    // Since we just fetched this from Google's secure token endpoint, 
    // we can safely decode it without full signature verification to save time.
    const decoded = jwt.decode(idToken) as any;

    if (!decoded || !decoded.sub || !decoded.email) {
        logError("[google] Invalid id_token payload", { idToken, decoded });
        throw new Error("Google sign-in failed. Please try again.");
    }

    return {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
        verified_email: decoded.email_verified ?? true,
    };
}
