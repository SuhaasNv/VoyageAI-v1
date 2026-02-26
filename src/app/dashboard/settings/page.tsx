"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, Bell, Shield, CreditCard, Loader2, CheckCircle } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { getCsrfToken } from "@/lib/api";

const fadeIn = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: "easeOut" as const } };


export default function SettingsPage() {
    const { user, updateUser } = useAuthStore();
    const [name, setName] = useState("");
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [tripReminders, setTripReminders] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (user?.name) setName(user.name);
        else if (user?.email) setName(user.email.split("@")[0] ?? "");
    }, [user?.name, user?.email]);

    return (
        <div className="min-h-screen p-8 max-w-3xl mx-auto space-y-10 relative noise-overlay">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(56,80,104,0.12),transparent_50%)] pointer-events-none -z-10" />

            <header>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">
                    Settings
                </h1>
                <p className="text-slate-400 text-base">Manage your account and preferences.</p>
            </header>

            <div className="space-y-8">
                <motion.section {...fadeIn} className="glass-dashboard p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <User className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-bold text-white">Profile</h2>
                    </div>
                    <div className="space-y-4">
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
                                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                placeholder="Your name"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                            <input
                                type="email"
                                value={user?.email ?? ""}
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
                                    const res = await fetch("/api/profile", {
                                        method: "PATCH",
                                        credentials: "include",
                                        headers: {
                                            "Content-Type": "application/json",
                                            "X-CSRF-Token": getCsrfToken(),
                                        },
                                        body: JSON.stringify({ name: trimmed }),
                                    });
                                    const json = await res.json();
                                    if (json.success && json.data?.user) {
                                        updateUser({ name: json.data.user.name });
                                        setSaveSuccess(true);
                                        setTimeout(() => setSaveSuccess(false), 3000);
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
                            className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all duration-200 flex items-center gap-2"
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
                    </div>
                </motion.section>

                <motion.section {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.05 }} className="glass-dashboard p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <Bell className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-bold text-white">Notifications</h2>
                    </div>
                    <div className="space-y-4">
                        <label className="flex items-center justify-between p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] cursor-pointer hover:bg-white/[0.06] transition-all">
                            <span className="text-sm font-medium text-slate-200">Email notifications</span>
                            <input
                                type="checkbox"
                                checked={emailNotifications}
                                onChange={(e) => setEmailNotifications(e.target.checked)}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/50"
                            />
                        </label>
                        <label className="flex items-center justify-between p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] cursor-pointer hover:bg-white/[0.06] transition-all">
                            <span className="text-sm font-medium text-slate-200">Trip reminders</span>
                            <input
                                type="checkbox"
                                checked={tripReminders}
                                onChange={(e) => setTripReminders(e.target.checked)}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/50"
                            />
                        </label>
                    </div>
                </motion.section>

                <motion.section {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.1 }} className="glass-dashboard p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <Shield className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-bold text-white">Security</h2>
                    </div>
                    <div className="space-y-4">
                        <button className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition-all text-left">
                            <span className="text-sm font-medium text-slate-200">Change password</span>
                            <span className="text-xs text-slate-500">→</span>
                        </button>
                        <button className="w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] transition-all text-left">
                            <span className="text-sm font-medium text-slate-200">Two-factor authentication</span>
                            <span className="text-xs text-slate-500">Coming soon</span>
                        </button>
                    </div>
                </motion.section>

                <motion.section {...fadeIn} transition={{ ...fadeIn.transition, delay: 0.15 }} className="glass-dashboard p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <CreditCard className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-bold text-white">Subscription</h2>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                        <p className="text-sm font-medium text-slate-200">Free Plan</p>
                        <p className="text-xs text-slate-400 mt-1">Upgrade to Pro for premium features and unlimited AI planning.</p>
                        <button className="mt-4 px-4 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-sm font-medium text-indigo-300 transition-all">
                            Upgrade to Pro
                        </button>
                    </div>
                </motion.section>
            </div>
        </div>
    );
}
