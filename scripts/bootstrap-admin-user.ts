/**
 * Create or update an admin user with a password (for hosted envs where you
 * cannot register as admin from the UI).
 *
 * Requires DATABASE_URL (same as the app). Set credentials only for this run:
 *
 *   BOOTSTRAP_ADMIN_EMAIL=suhaas@voyageai.com \
 *   BOOTSTRAP_ADMIN_PASSWORD='your-secure-password' \
 *   npx tsx scripts/bootstrap-admin-user.ts
 *
 * Then log in at /login. The email is already allow-listed in src/lib/admin.ts;
 * this script sets role ADMIN and a bcrypt passwordHash.
 */

import "dotenv/config";
import dns from "node:dns";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
}

const SALT_ROUNDS = 10;

async function main(): Promise<void> {
    const emailRaw = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const rawUrl = process.env.DATABASE_URL?.trim();

    if (!emailRaw || !password) {
        console.error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD for this command only.");
        process.exit(1);
    }
    if (!rawUrl) {
        console.error("DATABASE_URL is required.");
        process.exit(1);
    }

    const email = emailRaw.toLowerCase();
    const connectionString = rawUrl
        .replace(/[&?]sslmode=[^&?#]*/g, "")
        .replace(/[?&]$/, "");

    const pool = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 2,
    });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    try {
        const user = await prisma.user.upsert({
            where: { email },
            create: {
                email,
                passwordHash,
                role: "ADMIN",
                name: "Admin",
                emailVerified: true,
            },
            update: {
                passwordHash,
                role: "ADMIN",
            },
            select: { id: true, email: true, role: true },
        });
        console.log("OK — admin user ready:", user.email, "role=", user.role);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

void main().catch((e) => {
    console.error(e);
    process.exit(1);
});
