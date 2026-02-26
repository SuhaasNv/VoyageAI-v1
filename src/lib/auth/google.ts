/**
 * lib/auth/google.ts
 *
 * Google OAuth 2.0 – Authorization Code flow.
 * Used for server-side sign-in with Google.
 */

const GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URI = "https://www.googleapis.com/oauth2/v2/userinfo";

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
 * Exchange authorization code for tokens, then fetch user info.
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
        console.error("[google] Token exchange failed:", tokenRes.status, err);
        throw new Error("Google sign-in failed. Please try again.");
    }

    const tokens = (await tokenRes.json()) as {
        access_token?: string;
        id_token?: string;
        error?: string;
    };

    const accessToken = tokens.access_token;
    if (!accessToken) {
        console.error("[google] No access_token in response:", tokens);
        throw new Error("Google sign-in failed. Please try again.");
    }

    const userRes = await fetch(GOOGLE_USERINFO_URI, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
        console.error("[google] Userinfo fetch failed:", userRes.status);
        throw new Error("Google sign-in failed. Please try again.");
    }

    const user = (await userRes.json()) as GoogleUserInfo;
    if (!user.id || !user.email) {
        console.error("[google] Invalid userinfo:", user);
        throw new Error("Google sign-in failed. Please try again.");
    }

    return user;
}
