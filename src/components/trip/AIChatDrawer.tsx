"use client";

import { useState } from "react";
import { X, Send, Sparkles } from "lucide-react";
import { Logo } from "@/components/Logo";

export function AIChatDrawer() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: "ai", content: "Hi! I noticed your Day 3 schedule looks quite packed. Would you like me to suggest some alternative, more relaxed pacing?" }
    ]);
    const [input, setInput] = useState("");

    const handleSend = () => {
        if (!input.trim()) return;
        setMessages([...messages, { role: "user", content: input }]);
        setInput("");

        // Mock response
        setTimeout(() => {
            setMessages(prev => [...prev, {
                role: "ai",
                content: "I recommend moving the Akihabara visit to the morning of Day 2, and adding a 2-hour café break near Shibuya Crossing on Day 3 to recover."
            }]);
        }, 1000);
    };

    return (
        <>
            {/* Floating Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-indigo-500 hover:bg-indigo-400 text-white rounded-full shadow-[0_0_24px_rgba(99,102,241,0.4)] transition-all duration-200 ease-out hover:scale-[1.05] active:scale-95"
                >
                    <Sparkles className="w-6 h-6" />
                </button>
            )}

            <div className={`fixed bottom-6 right-6 z-50 w-[350px] bg-white/[0.06] backdrop-blur-xl border border-white/[0.1] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_1px_rgba(255,255,255,0.1)] flex flex-col overflow-hidden transition-all duration-300 ease-out origin-bottom-right ${isOpen ? 'scale-100 opacity-100 h-[500px]' : 'scale-75 opacity-0 h-0 pointer-events-none'}`}>

                <div className="bg-white/[0.04] p-4 border-b border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white font-semibold">
                        <Logo size="sm" />
                        <span>VoyageAI Copilot</span>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="w-7 h-7 bg-white/[0.06] hover:bg-white/[0.1] rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all duration-200 ease-out"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user'
                                    ? 'bg-indigo-500 text-white rounded-br-sm shadow-md'
                                    : 'bg-white/[0.06] text-slate-200 rounded-bl-sm border border-white/[0.08]'
                                }`}>
                                {msg.content}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-3 bg-white/[0.02] border-t border-white/[0.06] flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask AI to adjust plan..."
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-full px-4 text-sm text-white placeholder:text-slate-500 outline-none transition-all duration-200"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim()}
                        className="w-10 h-10 rounded-full bg-indigo-500 disabled:bg-white/[0.04] text-white disabled:text-slate-500 flex items-center justify-center transition-all duration-200 ease-out disabled:cursor-not-allowed"
                    >
                        <Send className="w-4 h-4 ml-0.5" />
                    </button>
                </div>
            </div>
        </>
    );
}
