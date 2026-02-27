"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { User, Bell, Shield, CreditCard, Loader2, CheckCircle, Sparkles, AlertCircle } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { getCsrfToken } from "@/lib/api";

const fadeIn = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: "easeOut" as const } };

const BUDGET_RANGES = ["Budget ($)", "Moderate ($$)", "Luxury ($$$)"];
const TRAVEL_STYLES = ["Relaxing/Wellness", "Adventure/Outdoors", "Culture/History", "Food & Drink", "Nightlife"];
const TRAVEL_PACES = ["Slow/Relaxed", "Moderate", "Fast/Packed"];
const INTERESTS = ["Beaches", "Mountains", "Cities", "Nature", "Museums", "Shopping", "Festivals", "Architecture"];
const REGIONS = ["North America", "South America", "Europe", "Asia", "Africa", "Middle East", "Oceania"];

export default function SettingsPage() {
    const { user, accessToken, updateUser, hydrateUser } = useAuthStore();
    const [name, setName] = useState("");
    const [profileEmail, setProfileEmail] = useState("");
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [tripReminders, setTripReminders] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    // Travel DNA State
    const [dnaBudget, setDnaBudget] = useState(BUDGET_RANGES[1]);
    const [dnaStyle, setDnaStyle] = useState(TRAVEL_STYLES[0]);
    const [dnaPace, setDnaPace] = useState(TRAVEL_PACES[1]);
    const [dnaInterests, setDnaInterests] = useState<string[]>([]);
    const [dnaRegions, setDnaRegions] = useState<string[]>([]);
    const [dnaSaving, setDnaSaving] = useState(false);
    const [dnaSaveSuccess, setDnaSaveSuccess] = useState(false);
    const [dnaSaveError, setDnaSaveError] = useState<string | null>(null);

    const saveSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dnaSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (saveSuccessTimeoutRef.current) clearTimeout(saveSuccessTimeoutRef.current);
            if (dnaSuccessTimeoutRef.current) clearTimeout(dnaSuccessTimeoutRef.current);
        };
    }, []);

    // Fetch full user record from backend so the form is always populated.
    useEffect(() => {
        const headers: Record<string, string> = {};
        if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

        // Fetch Profile
        fetch("/api/profile", { credentials: "include", headers })
            .then((r) => {
                if (r.status === 401) return null;
                return r.json();
            })
            .then(async (json) => {
                if (json?.success && json?.data?.user) {
                    const u = json.data.user;
                    setName(u.name ?? u.email?.split("@")[0] ?? "");
                    setProfileEmail(u.email ?? "");
                    setProfileImage(u.image ?? null);
                    updateUser({ name: u.name, image: u.image });
                } else {
                    const ok = await hydrateUser();
                    if (ok) {
                        const u = useAuthStore.getState().user;
                        if (u) {
                            setName(u.name ?? u.email?.split("@")[0] ?? "");
                            setProfileEmail(u.email ?? "");
                            setProfileImage(u.image ?? null);
                        }
                    }
                }
            })
            .catch(() => { })
            .finally(() => setProfileLoaded(true));

        // Fetch Travel DNA
        fetch("/api/preferences", { credentials: "include", headers })
            .then(r => r.json())
            .then(json => {
                if (json?.success && json?.data?.preference?.data) {
                    const d = json.data.preference.data;
                    if (d.budget) setDnaBudget(d.budget);
                    if (d.style) setDnaStyle(d.style);
                    if (d.pace) setDnaPace(d.pace);
                    if (d.interests) setDnaInterests(d.interests);
                    if (d.regions) setDnaRegions(d.regions);
                }
            })
            .catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync from auth store when user becomes available (e.g. from server layout)
    useEffect(() => {
        if (!user) return;
        setName(user.name ?? user.email?.split("@")[0] ?? "");
        setProfileEmail(user.email ?? "");
        setProfileImage(user.image ?? null);
        setProfileLoaded(true);
    }, [user]);

    const toggleSelection = (item: string, list: string[], setList: (v: string[]) => void) => {
        if (list.includes(item)) {
            setList(list.filter(i => i !== item));
        } else {
            setList([...list, item]);
        }
    };

    const handleSaveDNA = async () => {
        setDnaSaving(true);
        setDnaSaveError(null);
        setDnaSaveSuccess(false);

        const data = {
            budget: dnaBudget,
            style: dnaStyle,
            pace: dnaPace,
            interests: dnaInterests,
            regions: dnaRegions
        };

        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "X-CSRF-Token": getCsrfToken(),
            };
            if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

            const res = await fetch('/api/preferences', {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({ data })
            });

            const json = await res.json();
            if (json.success) {
                setDnaSaveSuccess(true);
                if (dnaSuccessTimeoutRef.current) clearTimeout(dnaSuccessTimeoutRef.current);
                dnaSuccessTimeoutRef.current = setTimeout(() => setDnaSaveSuccess(false), 3000);
            } else {
                setDnaSaveError(json.error?.message ?? "Failed to save Travel DNA.");
            }
        } catch {
            setDnaSaveError("Network error. Please try again.");
        } finally {
            setDnaSaving(false);
        }
    };

    return (
        <div className="h-full overflow-y-auto scroll-smooth hide-scrollbar">
            <div className="min-h-full p-6 md:p-8 lg:p-10 max-w-3xl mx-auto space-y-8 relative">
                <header className="pb-2">
                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-widest mb-0.5">Manage Account</p>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
                </header>

                <div className="space-y-6">
                    <motion.section {...fadeIn} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-sm backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-6">
                            <User className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-lg font-bold text-white">Profile</h2>
                        </div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-lg font-bold text-white overflow-hidden border-2 border-white/10 shrink-0">
                                {!profileLoaded ? (
                                    <div className="w-full h-full bg-white/10  rounded-full" />
                                ) : profileImage ? (
                                    <Image
                                        src={profileImage}
                                        alt={name || profileEmail}
                                        width={56}
                                        height={56}
                                        className="w-full h-full object-cover"
                                        unoptimized
                                    />
                                ) : (
                                    (name || profileEmail || "U").charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                {!profileLoaded ? (
                                    <div className="space-y-2">
                                        <div className="h-4 w-36 bg-white/10 rounded " />
                                        <div className="h-3 w-48 bg-white/5 rounded " />
                                    </div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ duration: 0.25, ease: "easeOut" }}
                                    >
                                        <p className="text-sm font-medium text-white truncate">{name || profileEmail}</p>
                                        <p className="text-xs text-slate-500">
                                            {profileImage ? "Profile picture from Google" : "Sign in with Google to add a profile picture"}
                                        </p>
                                    </motion.div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-4">
                            {!profileLoaded ? (
                                <div className="space-y-4">
                                    <div>
                                        <div className="h-3 w-12 bg-white/10 rounded mb-2" />
                                        <div className="h-12 w-full bg-white/5 rounded-xl " />
                                    </div>
                                    <div>
                                        <div className="h-3 w-12 bg-white/10 rounded mb-2" />
                                        <div className="h-12 w-full bg-white/5 rounded-xl " />
                                    </div>
                                </div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className="space-y-4"
                                >
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Name</label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => {
                                                setName(e.target.value);
                                                setSaveSuccess(false);
                                                setSaveError(null);
                                            }}
                                            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                                            placeholder="Your name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                                        <input
                                            type="email"
                                            value={profileEmail}
                                            readOnly
                                            className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3 text-slate-400 outline-none cursor-not-allowed"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">Email cannot be changed.</p>
                                    </div>
                                    {saveSuccess && (
                                        <p className="flex items-center gap-2 text-sm text-emerald-400">
                                            <CheckCircle className="w-4 h-4" />
                                            Profile updated successfully.
                                        </p>
                                    )}
                                    {saveError && (
                                        <p className="text-sm text-red-400">{saveError}</p>
                                    )}
                                    <button
                                        onClick={async () => {
                                            const trimmed = name.trim();
                                            if (!trimmed) {
                                                setSaveError("Name is required.");
                                                return;
                                            }
                                            setSaving(true);
                                            setSaveError(null);
                                            setSaveSuccess(false);
                                            try {
                                                const headers: Record<string, string> = {
                                                    "Content-Type": "application/json",
                                                    "X-CSRF-Token": getCsrfToken(),
                                                };
                                                if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
                                                const res = await fetch("/api/profile", {
                                                    method: "PATCH",
                                                    credentials: "include",
                                                    headers,
                                                    body: JSON.stringify({ name: trimmed }),
                                                });
                                                const json = await res.json();
                                                if (json.success && json.data?.user) {
                                                    updateUser({ name: json.data.user.name });
                                                    setSaveSuccess(true);
                                                    if (saveSuccessTimeoutRef.current) clearTimeout(saveSuccessTimeoutRef.current);
                                                    saveSuccessTimeoutRef.current = setTimeout(() => setSaveSuccess(false), 3000);
                                                } else {
                                                    setSaveError(json.error?.message ?? "Failed to update profile.");
                                                }
                                            } catch {
                                                setSaveError("Network error. Please try again.");
                                            } finally {
                                                setSaving(false);
                                            }
                                        }}
                                        disabled={saving}
                                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all duration-200 flex items-center gap-2"
                                    >
                                        {saving ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            "Save changes"
                                        )}
                                    </button>
                                </motion.div>
                            )}
                        </div>
                    </motion.section>

                    <motion.section {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.02 }} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-sm backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-6">
                            <Sparkles className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-lg font-bold text-white">Travel DNA</h2>
                        </div>
                        <div className="space-y-6">
                            {!profileLoaded ? (
                                <div className="space-y-4">
                                    <div className="h-12 w-full bg-white/5 rounded-xl" />
                                    <div className="h-12 w-full bg-white/5 rounded-xl" />
                                    <div className="h-12 w-full bg-white/5 rounded-xl" />
                                </div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    className="space-y-6"
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-300">Budget Range</label>
                                            <select
                                                value={dnaBudget}
                                                onChange={e => setDnaBudget(e.target.value)}
                                                disabled={dnaSaving}
                                                className="w-full bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] hover:border-white/[0.12] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 rounded-xl px-4 py-3 text-white outline-none transition-all duration-200 disabled:opacity-50 appearance-none"
                                            >
                                                {BUDGET_RANGES.map(b => (
                                                    <option key={b} value={b} className="bg-zinc-900 text-white">{b}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-300">Travel Style</label>
                                            <select
                                                value={dnaStyle}
                                                onChange={e => setDnaStyle(e.target.value)}
                                                disabled={dnaSaving}
                                                className="w-full bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] hover:border-white/[0.12] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 rounded-xl px-4 py-3 text-white outline-none transition-all duration-200 disabled:opacity-50 appearance-none"
                                            >
                                                {TRAVEL_STYLES.map(s => (
                                                    <option key={s} value={s} className="bg-zinc-900 text-white">{s}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-300">Travel Pace</label>
                                            <select
                                                value={dnaPace}
                                                onChange={e => setDnaPace(e.target.value)}
                                                disabled={dnaSaving}
                                                className="w-full bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] hover:border-white/[0.12] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 rounded-xl px-4 py-3 text-white outline-none transition-all duration-200 disabled:opacity-50 appearance-none"
                                            >
                                                {TRAVEL_PACES.map(p => (
                                                    <option key={p} value={p} className="bg-zinc-900 text-white">{p}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-sm font-semibold text-slate-300">Interests</label>
                                        <div className="flex flex-wrap gap-2">
                                            {INTERESTS.map(interest => (
                                                <button
                                                    key={interest}
                                                    onClick={() => toggleSelection(interest, dnaInterests, setDnaInterests)}
                                                    disabled={dnaSaving}
                                                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ease-out disabled:opacity-50 ${dnaInterests.includes(interest)
                                                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                                                        : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                                                        }`}
                                                >
                                                    {interest}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-sm font-semibold text-slate-300">Preferred Regions</label>
                                        <div className="flex flex-wrap gap-2">
                                            {REGIONS.map(region => (
                                                <button
                                                    key={region}
                                                    onClick={() => toggleSelection(region, dnaRegions, setDnaRegions)}
                                                    disabled={dnaSaving}
                                                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ease-out disabled:opacity-50 ${dnaRegions.includes(region)
                                                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                                                        : "bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.08] hover:text-white"
                                                        }`}
                                                >
                                                    {region}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {dnaSaveSuccess && (
                                        <p className="flex items-center gap-2 text-sm text-emerald-400">
                                            <CheckCircle className="w-4 h-4" />
                                            Travel DNA updated successfully.
                                        </p>
                                    )}
                                    {dnaSaveError && (
                                        <p className="flex items-center gap-2 text-sm text-red-400">
                                            <AlertCircle className="w-4 h-4" />
                                            {dnaSaveError}
                                        </p>
                                    )}

                                    <button
                                        onClick={handleSaveDNA}
                                        disabled={dnaSaving}
                                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all duration-200 flex items-center gap-2"
                                    >
                                        {dnaSaving ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            "Save Travel DNA"
                                        )}
                                    </button>
                                </motion.div>
                            )}
                        </div>
                    </motion.section>

                    <motion.section {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.05 }} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-sm backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-6">
                            <Bell className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-lg font-bold text-white">Notifications</h2>
                        </div>
                        <div className="space-y-3">
                            <label className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] cursor-pointer hover:bg-white/[0.04] transition-all">
                                <span className="text-sm font-medium text-slate-200">Email notifications</span>
                                <input
                                    type="checkbox"
                                    checked={emailNotifications}
                                    onChange={(e) => setEmailNotifications(e.target.checked)}
                                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/50"
                                />
                            </label>
                            <label className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] cursor-pointer hover:bg-white/[0.04] transition-all">
                                <span className="text-sm font-medium text-slate-200">Trip reminders</span>
                                <input
                                    type="checkbox"
                                    checked={tripReminders}
                                    onChange={(e) => setTripReminders(e.target.checked)}
                                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/50"
                                />
                            </label>
                        </div>
                    </motion.section>

                    <motion.section {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.1 }} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-sm backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-6">
                            <Shield className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-lg font-bold text-white">Security</h2>
                        </div>
                        <div className="space-y-3">
                            <button className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all text-left">
                                <span className="text-sm font-medium text-slate-200">Change password</span>
                                <span className="text-xs text-slate-500">→</span>
                            </button>
                            <button className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all text-left cursor-not-allowed opacity-80">
                                <span className="text-sm font-medium text-slate-200">Two-factor authentication</span>
                                <span className="text-xs text-emerald-500/80 bg-emerald-500/10 px-2 py-0.5 rounded-full">Coming soon</span>
                            </button>
                        </div>
                    </motion.section>

                    <motion.section {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.15 }} className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 shadow-sm backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-6">
                            <CreditCard className="w-5 h-5 text-emerald-500" />
                            <h2 className="text-lg font-bold text-white">Subscription</h2>
                        </div>
                        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-200">Free Plan</p>
                                    <p className="text-xs text-slate-400 mt-1">Upgrade to Pro for premium features and unlimited AI planning.</p>
                                </div>
                                <button className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-sm font-medium text-emerald-400 transition-all shadow-[0_0_12px_rgba(16,185,129,0.1)]">
                                    Upgrade to Pro
                                </button>
                            </div>
                        </div>
                    </motion.section>
                </div>
            </div>
        </div>
    );
}
