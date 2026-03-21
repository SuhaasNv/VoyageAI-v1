/**
 * Canonical app origin for server-side redirects and Google OAuth.
 * Trims whitespace and strips trailing slashes so we never emit double slashes
 * in redirect URIs (a common cause of redirect_uri_mismatch).
 */
export function getResolvedAppBaseUrl(): string {
    const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").trim();
    return raw.replace(/\/+$/, "");
}

export function getGoogleOAuthRedirectUri(): string {
    return `${getResolvedAppBaseUrl()}/api/auth/google/callback`;
}
