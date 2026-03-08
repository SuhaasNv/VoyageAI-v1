"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
import { logError } from "@/infrastructure/logger";

type Role = "USER" | "ADMIN" | "MODERATOR";

// ─── Delete user ──────────────────────────────────────────────────────────────

export async function deleteUser(userId: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const caller = await requireAdmin();

        if (caller.sub === userId) {
            return { ok: false, error: "You cannot delete your own account." };
        }

        await prisma.user.delete({ where: { id: userId } });

        revalidatePath("/admin/users");
        revalidatePath("/admin");
        return { ok: true };
    } catch (err) {
        if (err instanceof AdminAuthError) {
            return { ok: false, error: "Unauthorized." };
        }
        logError("[action:deleteUser] Failed", err);
        return { ok: false, error: "Delete failed. Please try again." };
    }
}

// ─── Update user role ─────────────────────────────────────────────────────────

export async function updateUserRole(
    userId: string,
    role: Role
): Promise<{ ok: boolean; error?: string }> {
    try {
        const caller = await requireAdmin();

        if (caller.sub === userId && role !== "ADMIN") {
            return { ok: false, error: "You cannot remove your own admin role." };
        }

        await prisma.user.update({ where: { id: userId }, data: { role } });

        revalidatePath("/admin/users");
        revalidatePath("/admin");
        return { ok: true };
    } catch (err) {
        if (err instanceof AdminAuthError) {
            return { ok: false, error: "Unauthorized." };
        }
        logError("[action:updateUserRole] Failed", err);
        return { ok: false, error: "Role update failed. Please try again." };
    }
}
