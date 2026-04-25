#!/usr/bin/env node
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const accessSecret = process.env.JWT_ACCESS_SECRET;
const csrfSecret = process.env.CSRF_SECRET;

if (!accessSecret || !csrfSecret) {
  console.error("Missing JWT_ACCESS_SECRET or CSRF_SECRET. Promptfoo auth bootstrap cannot run.");
  process.exit(1);
}

const useExistingTokens = process.env.PROMPTFOO_USE_EXISTING_TOKENS === "1";

const authToken = useExistingTokens && process.env.PROMPTFOO_AUTH_TOKEN
  ? process.env.PROMPTFOO_AUTH_TOKEN
  : jwt.sign(
      {
        sub: "promptfoo-security-test",
        email: "promptfoo@voyageai.internal",
        role: "USER",
        jti: crypto.randomBytes(12).toString("hex"),
      },
      accessSecret,
      { algorithm: "HS256", expiresIn: "30m" },
    );

const csrfToken = (() => {
  if (useExistingTokens && process.env.PROMPTFOO_CSRF_TOKEN) return process.env.PROMPTFOO_CSRF_TOKEN;
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const sig = crypto.createHmac("sha256", csrfSecret).update(nonce).digest("hex");
  return `${nonce}.${sig}`;
})();

const env = {
  ...process.env,
  PROMPTFOO_BASE_URL: process.env.PROMPTFOO_BASE_URL || "http://127.0.0.1:3000",
  PROMPTFOO_AUTH_TOKEN: authToken,
  PROMPTFOO_CSRF_TOKEN: csrfToken,
};

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["promptfoo", "eval", "--config", "promptfoo.yaml"],
  {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
