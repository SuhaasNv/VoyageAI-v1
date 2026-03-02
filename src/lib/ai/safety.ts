/**
 * AI Safety Layer
 *
 * sanitizeUserInput  — strips prompt-injection phrases, HTML, and code fences
 *                      from any user-supplied string before it reaches the LLM.
 *
 * validateLLMOutput  — verifies raw LLM text for dangerous content and length
 *                      before the rest of the stack parses or persists it.
 *                      Throws AIServiceError on violation so callers can rely on
 *                      the existing error-handling paths unchanged.
 */

import { AIServiceError } from "@/lib/ai/llm";

// ─── Injection patterns ────────────────────────────────────────────────────────

const INJECTION_PHRASES: string[] = [
    "ignore previous instructions",
    "ignore all previous",
    "disregard your instructions",
    "forget your instructions",
    "new system prompt",
    "act as ",
    "you are now ",
    "system:",
    "developer:",
    "jailbreak",
    "prompt injection",
];

// ─── Regex helpers (no `g` flag on matchers to avoid stateful lastIndex bugs) ──

/** Matches code fences: ```...``` (non-greedy, with or without lang tag). */
const CODE_FENCE_RE = /```[\s\S]*?```/g;

/** Strips any HTML/XML-like tag for sanitisation (replace, `g` flag). */
const HTML_STRIP_RE = /<\/?[a-zA-Z][^>]*>/g;

/** Detects any HTML/XML-like tag (test, no `g` flag). */
const HTML_CHECK_RE = /<\/?[a-zA-Z][^>]*>/;

/** Detects <script> tags specifically. */
const SCRIPT_CHECK_RE = /<script[\s\S]*?>/i;

// ─── Limits ────────────────────────────────────────────────────────────────────

const MAX_INPUT_CHARS  =  1_000;
const MAX_OUTPUT_CHARS = 20_000;

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Sanitises a user-supplied prompt before it is embedded in an LLM call.
 *
 * Operations (in order):
 *  1. Hard-cap at MAX_INPUT_CHARS.
 *  2. Strip code fences (``` … ```).
 *  3. Strip HTML/XML tags.
 *  4. Remove known prompt-injection phrases (case-insensitive).
 *  5. Collapse resulting whitespace and trim.
 *
 * Always returns a string — never null. The caller should check for an
 * empty result and return a 400 if the cleaned prompt carries no content.
 */
export function sanitizeUserInput(raw: string): string {
    // 1. Length cap
    let text = raw.slice(0, MAX_INPUT_CHARS);

    // 2. Code fences
    text = text.replace(CODE_FENCE_RE, " ");

    // 3. HTML tags
    text = text.replace(HTML_STRIP_RE, " ");

    // 4. Injection phrases
    for (const phrase of INJECTION_PHRASES) {
        // Escape regex metacharacters in the phrase before compiling.
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        text = text.replace(new RegExp(escaped, "gi"), " ");
    }

    // 5. Normalise whitespace
    return text.replace(/\s{2,}/g, " ").trim();
}

/**
 * Validates raw LLM output text before the stack parses or stores it.
 *
 * JSON mode checks:
 *  - Length ≤ MAX_OUTPUT_CHARS.
 *  - Trimmed text starts with `{` or `[`.
 *  - No `<script>` or HTML tags present.
 *
 * Text mode checks:
 *  - Length ≤ MAX_OUTPUT_CHARS.
 *  - No HTML tags present.
 *
 * Throws AIServiceError("SCHEMA_VALIDATION_FAILED") on any violation.
 * Does NOT throw when the text is empty — callers already guard for that.
 */
export function validateLLMOutput(text: string, mode: "json" | "text"): void {
    if (text.length > MAX_OUTPUT_CHARS) {
        throw new AIServiceError(
            "SCHEMA_VALIDATION_FAILED",
            `LLM output exceeds the maximum allowed length of ${MAX_OUTPUT_CHARS} characters`
        );
    }

    // <script> is dangerous in both modes.
    if (SCRIPT_CHECK_RE.test(text)) {
        throw new AIServiceError(
            "SCHEMA_VALIDATION_FAILED",
            "LLM output contains disallowed script content"
        );
    }

    if (mode === "json") {
        const trimmed = text.trimStart();
        if (trimmed.length > 0 && !trimmed.startsWith("{") && !trimmed.startsWith("[")) {
            throw new AIServiceError(
                "SCHEMA_VALIDATION_FAILED",
                "LLM JSON response does not start with { or ["
            );
        }
        if (HTML_CHECK_RE.test(text)) {
            throw new AIServiceError(
                "SCHEMA_VALIDATION_FAILED",
                "LLM JSON output contains embedded HTML content"
            );
        }
    }

    if (mode === "text") {
        if (HTML_CHECK_RE.test(text)) {
            throw new AIServiceError(
                "SCHEMA_VALIDATION_FAILED",
                "LLM text output contains raw HTML"
            );
        }
    }
}
