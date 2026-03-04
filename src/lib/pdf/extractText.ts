/**
 * lib/pdf/extractText.ts
 *
 * Extracts text from PDFs using pdf-parse first, then pdfjs-dist as fallback.
 * Some PDFs (e.g. certain encodings or structures) work better with one or the other.
 */

const MAX_CHARS = 20_000;
const MIN_TEXT_LENGTH = 20;

async function extractWithPdfParse(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return data.text?.trim() ?? "";
}

async function extractWithPdfJs(buffer: Buffer): Promise<string> {
    const { getDocument } = await import("pdfjs-dist");
    const typed = new Uint8Array(buffer);
    const loadingTask = getDocument({ data: typed });
    const doc = await loadingTask.promise;
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
            .map((item) => ("str" in item ? item.str : ""))
            .join("");
        parts.push(pageText);
    }
    await doc.destroy();
    return parts.join("\n\n").trim();
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    let text = "";
    try {
        text = await extractWithPdfParse(buffer);
    } catch {
        // pdf-parse failed (e.g. unsupported format), try pdfjs-dist
    }
    if (!text || text.length < MIN_TEXT_LENGTH) {
        try {
            text = await extractWithPdfJs(buffer);
        } catch {
            // both failed
        }
    }
    return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}
