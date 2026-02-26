/**
 * lib/auth/schemas.ts
 *
 * Zod validation schemas for all auth-related request bodies.
 * Import only these in API routes – never roll ad-hoc validation.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Re-usable field definitions
// ─────────────────────────────────────────────────────────────────────────────

const emailField = z
    .string()
    .min(1, "Email is required")
    .email("Invalid email address")
    .toLowerCase()
    .trim();

const passwordField = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one digit")
    .regex(
        /[^A-Za-z0-9]/,
        "Password must contain at least one special character"
    );

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const RegisterSchema = z
    .object({
        name: z
            .string()
            .min(2, "Name must be at least 2 characters")
            .max(100, "Name too long")
            .trim()
            .optional(),
        email: emailField,
        password: passwordField,
        confirmPassword: z.string().min(1, "Please confirm your password"),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

export type RegisterInput = z.infer<typeof RegisterSchema>;

// ─────────────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
    email: emailField,
    password: z
        .string()
        .min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// ─────────────────────────────────────────────────────────────────────────────

export const RefreshSchema = z.object({
    // The refresh token comes from the HttpOnly cookie, not the body.
    // This schema validates optional per-request metadata if needed.
});

export type RefreshInput = z.infer<typeof RefreshSchema>;
