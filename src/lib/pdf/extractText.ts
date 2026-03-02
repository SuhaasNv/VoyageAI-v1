/**
 * lib/pdf/extractText.ts
 *
 * Thin wrapper around pdf-parse.
 *
 * We use inline require() (not import) because pdf-parse is a CJS module and
 * dynamic import() produces unreliable .default binding when Next.js bypasses
 * the bundler via serverExternalPackages.  Inline require() is deferred to
 * function-call time so Next.js static analysis never sees it at module level.
 */

const MAX_CHARS = 20_000;

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (
        buf: Buffer
    ) => Promise<{ text: string }>;

    const data = await pdfParse(buffer);
    const text = data.text?.trim() ?? "";

    return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}
