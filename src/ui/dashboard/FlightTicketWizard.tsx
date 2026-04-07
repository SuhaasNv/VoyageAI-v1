"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
    X,
    Plane,
    Upload,
    CheckCircle2,
    Loader2,
    MapPin,
    Calendar,
    DollarSign,
    ArrowRight,
    Sparkles,
    FileText,
    AlertCircle,
} from "lucide-react";
import { ensureCsrfToken } from "@/lib/api";
import type { FlowInput } from "@/ui/components/itinerary-flow/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtractedTicket {
    destination:   string;
    departureCity: string;
    departureDate: string;
    returnDate:    string;
    airline?:      string;
    flightNumber?: string;
}

type FieldKey = "destination" | "departureCity" | "departureDate" | "returnDate";

type WizardStep = "upload" | "extracting" | "review" | "creating";

interface FlightTicketWizardProps {
    isOpen:       boolean;
    onClose:      () => void;
    onFlowStart?: (tripId: string, input: FlowInput) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STYLES = [
    { value: "relaxed",  label: "Relaxed"  },
    { value: "creative", label: "Creative" },
    { value: "exciting", label: "Exciting" },
    { value: "luxury",   label: "Luxury"   },
    { value: "budget",   label: "Budget"   },
] as const;

const stepVariants = {
    enter:  { opacity: 0, x: 24 },
    center: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
    exit:   { opacity: 0, x: -20, transition: { duration: 0.15, ease: "easeIn" as const } },
};

// ─── Progress Step Indicator ─────────────────────────────────────────────────

const STEPS: { key: WizardStep; label: string }[] = [
    { key: "upload",   label: "Upload"  },
    { key: "review",   label: "Review"  },
    { key: "creating", label: "Confirm" },
];

function StepDots({ current }: { current: WizardStep }) {
    const idx = STEPS.findIndex(s => s.key === current || (current === "extracting" && s.key === "upload"));
    return (
        <div className="flex items-center gap-2 justify-center mb-6">
            {STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                    <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-300 ${
                            i < idx   ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" :
                            i === idx ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300" :
                                        "bg-white/[0.04] border-white/[0.08] text-white/20"
                        }`}
                    >
                        {i < idx ? "✓" : i + 1}
                    </div>
                    {i < STEPS.length - 1 && (
                        <div className={`w-8 h-px transition-colors duration-300 ${i < idx ? "bg-emerald-500/30" : "bg-white/[0.06]"}`} />
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Field row used in the review step ───────────────────────────────────────

function FieldRow({
    icon,
    label,
    error,
    children,
}: {
    icon: React.ReactNode;
    label: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/30">
                {icon}
                {label}
            </label>
            {children}
            {error && (
                <p className="text-rose-400 text-[11px] flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {error}
                </p>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function FlightTicketWizard({ isOpen, onClose, onFlowStart }: FlightTicketWizardProps) {
    const [step,       setStep]       = useState<WizardStep>("upload");
    const [file,       setFile]       = useState<File | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [extracted,  setExtracted]  = useState<ExtractedTicket | null>(null);
    const [edited,     setEdited]     = useState<ExtractedTicket | null>(null);
    const [error,      setError]      = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});

    // Step-2 preference state
    const [budget,   setBudget]   = useState("");
    const [currency, setCurrency] = useState("USD");
    const [style,    setStyle]    = useState<typeof STYLES[number]["value"]>("relaxed");

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // Sync editable copy whenever extraction completes
    useEffect(() => {
        if (extracted) setEdited({ ...extracted });
    }, [extracted]);

    // ── Reset ─────────────────────────────────────────────────────────────────

    const handleClose = useCallback(() => {
        setStep("upload");
        setFile(null);
        setExtracted(null);
        setEdited(null);
        setError(null);
        setFieldErrors({});
        setBudget("");
        setStyle("relaxed");
        onClose();
    }, [onClose]);

    // ── File helpers ──────────────────────────────────────────────────────────

    const acceptFile = useCallback((f: File) => {
        if (f.type !== "application/pdf") { setError("Please upload a PDF file."); return; }
        if (f.size > 10 * 1024 * 1024) { setError("File too large — maximum 10 MB."); return; }
        setError(null);
        setFile(f);
    }, []);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) acceptFile(f);
        e.target.value = "";
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) acceptFile(f);
    }, [acceptFile]);

    // ── Step 1 → 2: Extract ───────────────────────────────────────────────────

    const handleExtract = useCallback(async () => {
        if (!file) return;
        setError(null);
        setStep("extracting");

        try {
            const csrf = await ensureCsrfToken();
            const form = new FormData();
            form.append("file", file);

            const res = await fetch("/api/ai/extract-ticket", {
                method:      "POST",
                credentials: "include",
                headers:     csrf ? { "x-csrf-token": csrf } : {},
                body:        form,
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) {
                const msg = json?.error?.message ?? (res.status === 422
                    ? "Could not read text from this PDF. Use a text-based ticket (not a scanned image)."
                    : "Extraction failed.");
                throw new Error(msg);
            }

            setExtracted(json.data as ExtractedTicket);
            setStep("review");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not read ticket.");
            setStep("upload");
        }
    }, [file]);

    // ── Field-level validation ────────────────────────────────────────────────

    const validateEdited = useCallback((): boolean => {
        if (!edited) return false;
        const errs: Partial<Record<FieldKey, string>> = {};

        if (!edited.destination.trim())  errs.destination  = "Destination is required";
        if (!edited.departureCity.trim()) errs.departureCity = "Origin city is required";

        if (!edited.departureDate) {
            errs.departureDate = "Departure date is required";
        } else if (isNaN(Date.parse(edited.departureDate))) {
            errs.departureDate = "Invalid date";
        }

        if (!edited.returnDate) {
            errs.returnDate = "Return date is required";
        } else if (edited.departureDate && edited.returnDate <= edited.departureDate) {
            errs.returnDate = "Return must be after departure";
        }

        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    }, [edited]);

    // ── Step 2 → 3: Create trip → fire flow ──────────────────────────────────

    const handleCreate = useCallback(async () => {
        if (!edited) return;
        if (!validateEdited()) return;

        setError(null);
        setStep("creating");

        try {
            const csrf = await ensureCsrfToken();
            const res = await fetch("/api/trips/from-ticket", {
                method:      "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(csrf ? { "x-csrf-token": csrf } : {}),
                },
                body: JSON.stringify({
                    destination:   edited.destination,
                    departureCity: edited.departureCity,
                    departureDate: edited.departureDate,
                    returnDate:    edited.returnDate,
                    airline:       edited.airline,
                    flightNumber:  edited.flightNumber,
                    budget:        budget ? Number(budget) : undefined,
                    currency,
                    style,
                }),
            });

            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message ?? "Trip creation failed.");

            const trip = json.data as { id: string; imageUrl?: string | null };
            const flowInput: FlowInput = {
                tripId:      trip.id,
                destination: edited.destination,
                startDate:   edited.departureDate,
                endDate:     edited.returnDate,
                style,
                imageUrl:    trip.imageUrl ?? null,
            };

            onFlowStart?.(trip.id, flowInput);
            handleClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
            setStep("review");
        }
    }, [edited, budget, currency, style, onFlowStart, handleClose, validateEdited]);

    // ── Editable field updater ────────────────────────────────────────────────

    function setField(key: FieldKey, value: string) {
        setEdited(prev => prev ? { ...prev, [key]: value } : prev);
        setFieldErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    }

    // ─── Render ───────────────────────────────────────────────────────────────

    if (!mounted || !isOpen) return null;

    const inputCls = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/20 focus:bg-white/[0.06] transition-all";
    const inputErrCls = "w-full bg-white/[0.04] border border-rose-500/40 rounded-xl px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-rose-500/60 transition-all";

    const modal = (
        <div
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
        >
            {/* Backdrop */}
            <motion.div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            />

            {/* Modal card */}
            <motion.div
                className="relative z-10 w-full max-w-md bg-[#0E1318] border border-white/[0.09] rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.7)] overflow-hidden"
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } }}
                exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                            <Plane className="w-3.5 h-3.5 text-indigo-400" />
                        </div>
                        <span className="text-sm font-bold text-white">Magic Ticket Import</span>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-5 min-h-[320px]">
                    <StepDots current={step} />

                    <AnimatePresence mode="wait" initial={false}>

                        {/* ── STEP 1: Upload ───────────────────────────────── */}
                        {(step === "upload" || step === "extracting") && (
                            <motion.div key="upload" variants={stepVariants} initial="enter" animate="center" exit="exit">
                                <p className="text-xs text-white/40 text-center mb-4">
                                    Drop your flight e-ticket or booking confirmation PDF
                                </p>

                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDrop={handleDrop}
                                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                                    onDragLeave={() => setIsDragOver(false)}
                                    className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-10 px-6 cursor-pointer transition-all duration-200 select-none ${
                                        isDragOver
                                            ? "border-indigo-400/60 bg-indigo-500/8"
                                            : file
                                            ? "border-emerald-400/40 bg-emerald-500/5"
                                            : "border-white/[0.1] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                                    }`}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="application/pdf"
                                        className="hidden"
                                        onChange={handleFileInput}
                                    />

                                    {file ? (
                                        <>
                                            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                                                <FileText className="w-5 h-5 text-emerald-400" />
                                            </div>
                                            <div className="text-center space-y-0.5">
                                                <p className="text-sm font-semibold text-white truncate max-w-[200px]">{file.name}</p>
                                                <p className="text-xs text-white/35">{(file.size / 1024).toFixed(0)} KB · PDF</p>
                                            </div>
                                            <p className="text-[11px] text-white/25">Click to change · Text-based PDFs only</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${isDragOver ? "bg-indigo-500/20 border-indigo-400/40" : "bg-white/[0.04] border-white/[0.1]"}`}>
                                                <Upload className={`w-5 h-5 ${isDragOver ? "text-indigo-300" : "text-white/30"}`} />
                                            </div>
                                            <div className="text-center space-y-1">
                                                <p className="text-sm font-medium text-white/60">Drop your ticket here</p>
                                                <p className="text-xs text-white/25">or click to browse · PDF only · max 10 MB</p>
                                                <p className="text-[10px] text-white/20">Text-based PDFs only (scanned tickets may not work)</p>
                                            </div>
                                            <div className="flex gap-2 mt-1">
                                                {["e-ticket", "booking conf.", "itinerary"].map(t => (
                                                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-white/30">{t}</span>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {error && (
                                    <div className="flex items-start gap-2 mt-3 p-3 rounded-xl bg-rose-500/8 border border-rose-500/20 text-xs text-rose-400">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <button
                                    onClick={handleExtract}
                                    disabled={!file || step === "extracting"}
                                    className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
                                >
                                    {step === "extracting" ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Reading your ticket…
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            Analyze Ticket
                                        </>
                                    )}
                                </button>
                            </motion.div>
                        )}

                        {/* ── STEP 2: Review + edit ─────────────────────────── */}
                        {step === "review" && edited && (
                            <motion.div key="review" variants={stepVariants} initial="enter" animate="center" exit="exit" className="space-y-4">

                                {/* Success banner */}
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span className="text-xs font-semibold text-emerald-300">
                                        Trip detected: {extracted?.destination}
                                        {extracted?.departureDate ? ` · ${extracted.departureDate.slice(5).replace("-", "/")}` : ""}
                                        {extracted?.returnDate    ? ` → ${extracted.returnDate.slice(5).replace("-", "/")}` : ""}
                                    </span>
                                </div>

                                {/* Editable core fields */}
                                <div className="space-y-3 rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/25 mb-3">Review your trip details</p>

                                    <FieldRow icon={<MapPin className="w-3 h-3" />} label="Destination" error={fieldErrors.destination}>
                                        <input
                                            type="text"
                                            value={edited.destination}
                                            onChange={e => setField("destination", e.target.value)}
                                            placeholder="e.g. Tokyo"
                                            className={fieldErrors.destination ? inputErrCls : inputCls}
                                        />
                                    </FieldRow>

                                    <FieldRow icon={<Plane className="w-3 h-3" />} label="Origin city" error={fieldErrors.departureCity}>
                                        <input
                                            type="text"
                                            value={edited.departureCity}
                                            onChange={e => setField("departureCity", e.target.value)}
                                            placeholder="e.g. Singapore"
                                            className={fieldErrors.departureCity ? inputErrCls : inputCls}
                                        />
                                    </FieldRow>

                                    <div className="grid grid-cols-2 gap-2">
                                        <FieldRow icon={<Calendar className="w-3 h-3" />} label="Departure" error={fieldErrors.departureDate}>
                                            <input
                                                type="date"
                                                value={edited.departureDate}
                                                onChange={e => setField("departureDate", e.target.value)}
                                                className={`${fieldErrors.departureDate ? inputErrCls : inputCls} [color-scheme:dark]`}
                                            />
                                        </FieldRow>
                                        <FieldRow icon={<Calendar className="w-3 h-3" />} label="Return" error={fieldErrors.returnDate}>
                                            <input
                                                type="date"
                                                value={edited.returnDate}
                                                onChange={e => setField("returnDate", e.target.value)}
                                                className={`${fieldErrors.returnDate ? inputErrCls : inputCls} [color-scheme:dark]`}
                                            />
                                        </FieldRow>
                                    </div>

                                    {(edited.airline || edited.flightNumber) && (
                                        <div className="flex items-center gap-2 pt-1 text-xs text-white/30">
                                            <Plane className="w-3 h-3 shrink-0" />
                                            {[edited.airline, edited.flightNumber].filter(Boolean).join(" · ")}
                                        </div>
                                    )}
                                </div>

                                {/* Budget + style */}
                                <div className="space-y-3">
                                    <p className="text-[10px] font-bold text-white/25 uppercase tracking-wider">Customize Your Plan</p>

                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400/70 pointer-events-none" />
                                            <input
                                                type="number"
                                                value={budget}
                                                onChange={e => setBudget(e.target.value)}
                                                placeholder="Budget (optional)"
                                                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
                                            />
                                        </div>
                                        <select
                                            value={currency}
                                            onChange={e => setCurrency(e.target.value)}
                                            className="w-20 bg-white/[0.04] border border-white/[0.08] rounded-xl px-2 py-2 text-sm text-white focus:outline-none appearance-none text-center"
                                        >
                                            {["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "INR"].map(c => (
                                                <option key={c} value={c} className="bg-[#0E1318]">{c}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex gap-2 flex-wrap">
                                        {STYLES.map(s => (
                                            <button
                                                key={s.value}
                                                type="button"
                                                onClick={() => setStyle(s.value)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                                    style === s.value
                                                        ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                                                        : "bg-white/[0.03] border-white/[0.07] text-white/35 hover:border-white/15 hover:text-white/60"
                                                }`}
                                            >
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {error && (
                                    <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/8 border border-rose-500/20 text-xs text-rose-400">
                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={() => { setError(null); setFieldErrors({}); setStep("upload"); }}
                                        className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/40 hover:text-white/70 text-sm font-medium transition-colors"
                                    >
                                        Back
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold transition-all"
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        Confirm &amp; Start Planning
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* ── STEP 3: Creating ─────────────────────────────── */}
                        {step === "creating" && (
                            <motion.div key="creating" variants={stepVariants} initial="enter" animate="center" exit="exit" className="flex flex-col items-center gap-5 py-6">
                                <div className="relative">
                                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                        <Plane className="w-6 h-6 text-indigo-400 animate-pulse" />
                                    </div>
                                    <Loader2 className="absolute -top-1 -right-1 w-5 h-5 text-indigo-400 animate-spin" />
                                </div>
                                <div className="text-center space-y-1.5">
                                    <p className="text-sm font-semibold text-white">Creating your trip…</p>
                                    <p className="text-xs text-white/30">
                                        Building your {edited?.destination ?? "trip"} itinerary with AI
                                    </p>
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );

    return createPortal(
        <AnimatePresence>
            {isOpen && modal}
        </AnimatePresence>,
        document.body
    );
}
