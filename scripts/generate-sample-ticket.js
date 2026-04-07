/**
 * Generates a realistic Singapore Airlines e-ticket PDF using raw PDF syntax.
 * No external dependencies required — pure Node.js.
 *
 * Output: <project-root>/sample-ticket.pdf
 */

"use strict";

const fs   = require("fs");
const path = require("path");

// ── Content ──────────────────────────────────────────────────────────────────

const TICKET = {
    bookingRef:    "7XKQMN",
    passenger:     "John Traveller",
    origin:        "Singapore (SIN)",
    originCity:    "Singapore",
    dest:          "Tokyo (NRT)",
    destCity:      "Tokyo",
    airline:       "Singapore Airlines",
    outbound: {
        flight:    "SQ637",
        date:      "10 April 2026",
        departs:   "08:45",
        arrives:   "16:30",
        class:     "Economy",
    },
    inbound: {
        flight:    "SQ638",
        date:      "17 April 2026",
        departs:   "18:00",
        arrives:   "23:55",
        class:     "Economy",
    },
    departureDateISO: "2026-04-10",
    returnDateISO:    "2026-04-17",
};

// ── PDF Builder ───────────────────────────────────────────────────────────────

/**
 * Encode a string for use inside a PDF text stream (escape parens and backslash).
 */
function ps(str) {
    return str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Build a PDF content stream that draws the ticket.
 * Uses only the built-in Helvetica / Helvetica-Bold fonts.
 */
function buildContentStream() {
    const t = TICKET;
    const lines = [];

    function text(x, y, size, bold, str) {
        lines.push(`BT`);
        lines.push(`/${bold ? "F2" : "F1"} ${size} Tf`);
        lines.push(`${x} ${y} Td`);
        lines.push(`(${ps(str)}) Tj`);
        lines.push(`ET`);
    }

    function hRule(y) {
        lines.push(`0.15 w`);
        lines.push(`0.5 0.5 0.5 RG`);
        lines.push(`50 ${y} m`);
        lines.push(`562 ${y} l`);
        lines.push(`S`);
    }

    function rect(x, y, w, h, r, g, b) {
        lines.push(`${r} ${g} ${b} rg`);
        lines.push(`${x} ${y} ${w} ${h} re`);
        lines.push(`f`);
        lines.push(`0 0 0 rg`); // reset fill
    }

    // ── Header bar ──────────────────────────────────────────────────────────
    rect(0, 742, 612, 50, 0.05, 0.07, 0.12);

    // Airline name (white on dark)
    lines.push(`1 1 1 rg`); // white text fill
    text(50, 757, 16, true, t.airline);
    lines.push(`0.4 0.75 0.4 rg`); // green accent
    text(430, 757, 10, false, `E-TICKET CONFIRMATION`);
    lines.push(`0 0 0 rg`);

    // ── Booking reference block ──────────────────────────────────────────────
    rect(50, 685, 512, 48, 0.96, 0.97, 0.98);
    text(65, 715, 8, false, `BOOKING REFERENCE`);
    text(65, 700, 14, true, t.bookingRef);
    text(310, 715, 8, false, `PASSENGER`);
    text(310, 700, 12, true, t.passenger);

    // ── Divider ──────────────────────────────────────────────────────────────
    hRule(678);

    // ── Outbound flight ──────────────────────────────────────────────────────
    text(50, 660, 8, false, `OUTBOUND FLIGHT`);
    hRule(652);

    text(50,  632, 20, true,  t.originCity);
    text(50,  617, 9,  false, t.origin);
    text(50,  601, 9,  false, `Departs: ${t.outbound.departs}`);

    text(220, 632, 14, true, `→`);

    text(310, 632, 20, true,  t.destCity);
    text(310, 617, 9,  false, t.dest);
    text(310, 601, 9,  false, `Arrives: ${t.outbound.arrives}`);

    text(480, 640, 9,  false, `Flight`);
    text(480, 628, 11, true,  t.outbound.flight);
    text(480, 615, 9,  false, t.outbound.class);

    // Date pill
    rect(50, 586, 200, 14, 0.93, 0.97, 0.93);
    text(55, 589, 9, false, `Date: ${t.outbound.date}   (${t.departureDateISO})`);

    // ── Divider ──────────────────────────────────────────────────────────────
    hRule(578);

    // ── Return flight ────────────────────────────────────────────────────────
    text(50, 560, 8, false, `RETURN FLIGHT`);
    hRule(552);

    text(50,  532, 20, true,  t.destCity);
    text(50,  517, 9,  false, t.dest);
    text(50,  501, 9,  false, `Departs: ${t.inbound.departs}`);

    text(220, 532, 14, true, `→`);

    text(310, 532, 20, true,  t.originCity);
    text(310, 517, 9,  false, t.origin);
    text(310, 501, 9,  false, `Arrives: ${t.inbound.arrives}`);

    text(480, 540, 9,  false, `Flight`);
    text(480, 528, 11, true,  t.inbound.flight);
    text(480, 515, 9,  false, t.inbound.class);

    // Date pill
    rect(50, 486, 200, 14, 0.93, 0.97, 0.93);
    text(55, 489, 9, false, `Date: ${t.inbound.date}   (${t.returnDateISO})`);

    // ── Divider ──────────────────────────────────────────────────────────────
    hRule(478);

    // ── Fare summary ─────────────────────────────────────────────────────────
    text(50, 460, 8, false, `FARE SUMMARY`);
    text(50, 443, 9, false, `Base fare:     SGD 820.00`);
    text(50, 430, 9, false, `Taxes & fees:  SGD 178.50`);
    text(50, 417, 9, false, `Total charged: SGD 998.50`);
    text(50, 402, 8, false, `Seat:  32A (Window)     Baggage: 30 kg included`);

    // ── Fine print ───────────────────────────────────────────────────────────
    hRule(392);
    text(50, 376, 7, false, `This is an electronic ticket. Please present this document along with a valid photo ID at check-in.`);
    text(50, 364, 7, false, `Check-in opens 48 hours before departure. Online check-in closes 1 hour before departure.`);
    text(50, 352, 7, false, `Departure city: Singapore   Destination: Tokyo   Airline: ${t.airline}   Flight: ${t.outbound.flight} / ${t.inbound.flight}`);

    // ── Footer ───────────────────────────────────────────────────────────────
    rect(0, 0, 612, 30, 0.05, 0.07, 0.12);
    lines.push(`1 1 1 rg`);
    text(50,  10, 7, false, `${t.airline} · www.singaporeair.com · Reservations: +65 6223 8888`);
    text(440, 10, 7, false, `Generated: 07 April 2026`);
    lines.push(`0 0 0 rg`);

    return lines.join("\n");
}

// ── Low-level PDF assembler ───────────────────────────────────────────────────

function buildPdf() {
    const parts   = [];     // string segments of the final PDF
    const offsets = [];     // byte offset of each object (1-indexed, offsets[0] = obj 1)
    let   bytes   = 0;

    function emit(str) {
        parts.push(str);
        bytes += Buffer.byteLength(str, "latin1");
    }

    // Header
    emit("%PDF-1.4\n");

    // Object 1 — Catalog
    offsets[0] = bytes;
    emit("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    // Object 2 — Pages
    offsets[1] = bytes;
    emit("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

    // Build content stream first so we know its length
    const content = buildContentStream();
    const contentBuf = Buffer.from(content, "latin1");

    // Object 3 — Page
    offsets[2] = bytes;
    emit(
        "3 0 obj\n" +
        "<< /Type /Page /Parent 2 0 R\n" +
        "   /MediaBox [0 0 612 792]\n" +
        "   /Contents 4 0 R\n" +
        "   /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\n" +
        "endobj\n"
    );

    // Object 4 — Content stream
    offsets[3] = bytes;
    emit(`4 0 obj\n<< /Length ${contentBuf.length} >>\nstream\n`);
    emit(content);
    emit("\nendstream\nendobj\n");

    // Object 5 — Font F1 (Helvetica)
    offsets[4] = bytes;
    emit(
        "5 0 obj\n" +
        "<< /Type /Font /Subtype /Type1\n" +
        "   /BaseFont /Helvetica\n" +
        "   /Encoding /WinAnsiEncoding >>\n" +
        "endobj\n"
    );

    // Object 6 — Font F2 (Helvetica-Bold)
    offsets[5] = bytes;
    emit(
        "6 0 obj\n" +
        "<< /Type /Font /Subtype /Type1\n" +
        "   /BaseFont /Helvetica-Bold\n" +
        "   /Encoding /WinAnsiEncoding >>\n" +
        "endobj\n"
    );

    // xref table — each entry is exactly 20 bytes: 10-digit-offset SP 5-digit-gen SP f/n SP LF
    const xrefOffset = bytes;
    const objCount   = 7; // objects 0-6
    emit("xref\n0 " + objCount + "\n");
    emit("0000000000 65535 f \n"); // object 0 (free list head) — space+LF = 2-byte EOL
    for (let i = 0; i < offsets.length; i++) {
        emit(String(offsets[i]).padStart(10, "0") + " 00000 n \n");
    }

    // Trailer
    emit(
        `trailer\n<< /Size ${objCount} /Root 1 0 R >>\n` +
        `startxref\n${xrefOffset}\n` +
        "%%EOF\n"
    );

    return Buffer.from(parts.join(""), "latin1");
}

// ── Write file ────────────────────────────────────────────────────────────────

const outPath = path.join(__dirname, "..", "sample-ticket.pdf");
const buf     = buildPdf();
fs.writeFileSync(outPath, buf);

console.log(`✓ Written ${buf.length} bytes → ${outPath}`);
console.log(`  Booking: ${TICKET.bookingRef}  |  ${TICKET.originCity} → ${TICKET.destCity}`);
console.log(`  Outbound: ${TICKET.departureDateISO}  |  Return: ${TICKET.returnDateISO}`);
console.log();
console.log("  Parser notes:");
console.log("  • pdfjs-dist (v5) — ✓ full text extraction (primary fallback in extractTextFromPdf)");
console.log("  • pdf-parse (pdfjs v1.10.100 bundle) — will skip via fallback (known quirk with hand-crafted PDFs)");
console.log("  The /api/ai/extract-ticket endpoint handles this automatically.");
