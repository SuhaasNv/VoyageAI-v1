"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, MoveRight, Loader2, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { Logo } from "@/ui/components/Logo";

// ── Component ─────────────────────────────────────────────────────────────

export default function LoginPage() {
    const router = useRouter();
    const { setAuth, setLoading, isLoading } = useAuthStore();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
    useEffect(() => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        const reason = url.searchParams.get("reason");
        const errorParam = url.searchParams.get("error");
        if (reason === "session_expired") {
            setError("Your session has expired. Please log in again.");
        } else if (errorParam) {
            const msg = decodeURIComponent(errorParam);
            const showAdBlockerHint =
                !/cancelled/i.test(msg) &&
                /google sign-in failed|invalid sign-in request|session expired/i.test(msg);
            setError(
                showAdBlockerHint
                    ? `${msg} Ad blockers often block Google sign-in—try disabling them or use an incognito window.`
                    : msg
            );
        }
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setFieldErrors({});
        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const json = await res.json();

            if (!json.success) {
                if (json.error?.code === "VALIDATION_ERROR") {
                    setFieldErrors(json.error.details ?? {});
                } else {
                    setError(json.error?.message ?? "Login failed. Please try again.");
                }
                return;
            }

            setAuth(json.data.user, json.data.accessToken);
            const url = new URL(window.location.href);
            const defaultDest = json.data.user?.role === "ADMIN" ? "/admin" : "/dashboard";
            const returnUrl = url.searchParams.get("returnUrl") || defaultDest;
            router.replace(returnUrl);
        } catch {
            setError("Network error. Please check your connection.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#10141a] px-4">
            {/* Background glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-brand-500/10 blur-[120px]" />
                <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-indigo-500/10 blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="relative z-10 w-full max-w-md"
            >
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2 mb-8 justify-center">
                    <Logo size="md" />
                    <span className="text-xl font-semibold tracking-tight text-white">VoyageAI</span>
                </Link>

                {/* Card */}
                <div className="glass-card p-8">
                    <div className="mb-6">
                        <h1 className="text-2xl font-bold text-white">Welcome back</h1>
                        <p className="text-slate-400 text-sm mt-1">Sign in to continue planning your next adventure</p>
                    </div>

                    {/* Session expired / global error */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                key="error"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mb-5 flex items-start gap-2.5 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400"
                            >
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form onSubmit={handleSubmit} noValidate className="space-y-4">
                        {/* Email */}
                        {/* suppressHydrationWarning: password-manager extensions (e.g. Shark) inject
                            data-* attributes and child nodes into <input> elements at runtime,
                            causing an unavoidable server/client HTML mismatch. */}
                        <div suppressHydrationWarning>
                            <label htmlFor="login-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                                Email address
                            </label>
                            <input
                                suppressHydrationWarning
                                id="login-email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition-all"
                            />
                            {fieldErrors.email?.map((m) => (
                                <p key={m} className="mt-1 text-xs text-red-400">{m}</p>
                            ))}
                        </div>

                        {/* Password — same suppressHydrationWarning rationale as email above */}
                        <div suppressHydrationWarning>
                            <div className="flex items-center justify-between mb-1.5">
                                <label htmlFor="login-password" className="block text-xs font-medium text-slate-300">
                                    Password
                                </label>
                                <Link href="/forgot-password" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                                    Forgot password?
                                </Link>
                            </div>
                            <div suppressHydrationWarning className="relative">
                                <input
                                    suppressHydrationWarning
                                    id="login-password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 pr-11 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500/50 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {fieldErrors.password?.map((m) => (
                                <p key={m} className="mt-1 text-xs text-red-400">{m}</p>
                            ))}
                        </div>

                        {/* Submit */}
                        <button
                            id="login-submit"
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-[#10141a] font-semibold text-sm py-2.5 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed transition-all mt-2"
                        >
                            {isLoading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <>Sign in <MoveRight className="w-4 h-4" /></>
                            )}
                        </button>
                    </form>

                    <div className="relative flex items-center gap-3 my-6">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-xs text-slate-500">or</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>

                    {/* Google SSO */}
                    <a
                        href="/api/auth/google?redirect=/dashboard"
                        className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-all"
                    >
                        <GoogleIcon />
                        Continue with Google
                    </a>
                    <p className="text-xs text-slate-500 mt-2 text-center">
                        Ad blockers can block Google sign-in. If it fails, try disabling extensions or use an incognito window.
                    </p>

                    <p className="text-center text-sm text-slate-400 mt-6">
                        Don&apos;t have an account?{" "}
                        <Link href="/signup" className="text-white font-medium hover:underline">
                            Sign up
                        </Link>
                    </p>
                </div>
            </motion.div>
        </div>
    );
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
}
