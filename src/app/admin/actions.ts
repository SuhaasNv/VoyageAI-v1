"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, AdminAuthError } from "@/lib/admin";
import { logError } from "@/infrastructure/logger";

type Role = "USER" | "ADMIN" | "MODERATOR";

const RoleSchema = z.enum(["USER", "ADMIN", "MODERATOR"]);

// ─── Toggle isActive ──────────────────────────────────────────────────────────

export async function toggleUserActive(userId: string): Promise<{ ok: boolean; isActive?: boolean; error?: string }> {
    try {
        const caller = await requireAdmin();

        if (caller.sub === userId) {
            return { ok: false, error: "You cannot deactivate your own account." };
        }

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
        if (!user) return { ok: false, error: "User not found." };

        const updated = await prisma.user.update({
            where: { id: userId },
            data: { isActive: !user.isActive },
            select: { isActive: true },
        });

        revalidatePath("/admin/users");
        revalidatePath("/admin");
        return { ok: true, isActive: updated.isActive };
    } catch (err) {
        if (err instanceof AdminAuthError) return { ok: false, error: "Unauthorized." };
        logError("[action:toggleUserActive] Failed", err);
        return { ok: false, error: "Failed to update user status." };
    }
}

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
    const roleValidation = RoleSchema.safeParse(role);
    if (!roleValidation.success) {
        return { ok: false, error: "Invalid role. Must be USER, ADMIN, or MODERATOR." };
    }

    try {
        const caller = await requireAdmin();

        if (caller.sub === userId && roleValidation.data !== "ADMIN") {
            return { ok: false, error: "You cannot remove your own admin role." };
        }

        await prisma.user.update({ where: { id: userId }, data: { role: roleValidation.data } });

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
