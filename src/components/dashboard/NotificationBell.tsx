"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Bell, X } from "lucide-react";

interface Notification {
    id: string;
    type: string;
    message: string;
    isRead: boolean;
    createdAt: string;
}

export function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const unreadCount = useMemo(() =>
        notifications.filter(n => !n.isRead).length
        , [notifications]);

    const fetchNotifications = async () => {
        try {
            const res = await fetch("/api/notifications");
            const data = await res.json();
            if (data.success) {
                setNotifications(data.data.notifications);
            }
        } catch (error) {
            console.error("Failed to fetch notifications:", error);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000); // Poll every 60s
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const markAsRead = async (id: string) => {
        try {
            const res = await fetch(`/api/notifications/${id}/read`, {
                method: "PATCH"
            });
            const data = await res.json();
            if (data.success) {
                setNotifications(prev =>
                    prev.map(n => n.id === id ? { ...n, isRead: true } : n)
                );
            }
        } catch (error) {
            console.error("Failed to mark notification as read:", error);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors relative"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute top-2.5 right-2.5 w-4 h-4 bg-[#10B981] border-2 border-[#0B0F14] rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 mt-3 w-80 max-h-[480px] bg-[#0B0F14]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
                >
                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white">Notifications</h3>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="text-zinc-500 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto hide-scrollbar py-2">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <p className="text-sm text-zinc-500">No notifications yet</p>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {notifications.map((n) => (
                                    <button
                                        key={n.id}
                                        onClick={() => markAsRead(n.id)}
                                        className={`w-full text-left p-4 hover:bg-white/5 transition-colors border-b border-white/[0.03] last:border-0 relative ${!n.isRead ? "bg-white/[0.02]" : ""}`}
                                    >
                                        <div className="flex gap-3">
                                            {!n.isRead && (
                                                <div className="mt-1.5 w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                                            )}
                                            <div className="space-y-1 overflow-hidden">
                                                <p className={`text-sm leading-relaxed ${!n.isRead ? "text-white font-medium" : "text-zinc-400"}`}>
                                                    {n.message}
                                                </p>
                                                <p className="text-[10px] text-zinc-600 font-medium">
                                                    {new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {notifications.length > 0 && (
                        <div className="p-3 border-t border-white/5 text-center">
                            <button className="text-[11px] font-bold text-[#10B981] hover:text-[#10B981]/80 transition-colors uppercase tracking-wider">
                                View all
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
