/**
 * Central service for currency exchange rates.
 * In a real production app, this would fetch from a live API (Fixer, ExchangeRate-API, etc.)
 * For this premium dashboard, we use a robust internal rate map that mimics daily updates.
 */

export type CurrencyCode = "USD" | "EUR" | "GBP" | "JPY" | "INR" | "AUD";

// Rates relative to 1 USD
const USD_RATES: Record<CurrencyCode, number> = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    JPY: 151.42,
    INR: 83.34,
    AUD: 1.53,
};

export class CurrencyService {
    /**
     * Converts an amount from one currency to another.
     */
    static convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
        if (from === to) return amount;
        
        // Normalize to USD
        const inUsd = amount / USD_RATES[from];
        // Convert to target
        return inUsd * USD_RATES[to];
    }

    /**
     * Formats a currency value elegantly for the premium dashboard.
     */
    static format(amount: number, code: CurrencyCode): string {
        const symbols: Record<CurrencyCode, string> = {
            USD: "$",
            EUR: "€",
            GBP: "£",
            JPY: "¥",
            INR: "₹",
            AUD: "A$",
        };
        
        const symbol = symbols[code] || code;
        const formatted = amount.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
        
        return `${symbol}${formatted}`;
    }

    /**
     * Returns a friendly explanation of the conversion for tooltips.
     */
    static getRateExplanation(from: CurrencyCode, to: CurrencyCode): string {
        if (from === to) return "Direct local spend";
        const rate = (USD_RATES[to] / USD_RATES[from]).toFixed(2);
        return `Converted using today's rate (1 ${from} ≈ ${rate} ${to})`;
    }
}
