/**
 * Copy all public table data from SOURCE → TARGET (same schema as Prisma).
 * Does not copy `_prisma_migrations` (target already has migrations applied).
 *
 * Usage:
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 COPY_SOURCE_DATABASE_URL="postgresql://..." COPY_TARGET_DATABASE_URL="postgresql://..." npx tsx scripts/copy-postgres-data.ts
 *
 * NODE_TLS_REJECT_UNAUTHORIZED=0 is often required when proxies present TLS chains Node rejects.
 */
import pg from "pg";

const BATCH = 250;

const sourceUrl = process.env.COPY_SOURCE_DATABASE_URL?.trim();
const targetUrl = process.env.COPY_TARGET_DATABASE_URL?.trim();

if (!sourceUrl || !targetUrl) {
  console.error(
    "Set COPY_SOURCE_DATABASE_URL and COPY_TARGET_DATABASE_URL (both required).",
  );
  process.exit(1);
}

/** FK-safe insert order (parents before children). */
const TABLES = [
  "users",
  "refresh_tokens",
  "audit_logs",
  "rate_limit_entries",
  "ai_usage_logs",
  "admin_action_logs",
  "ai_decision_logs",
  "agent_execution_logs",
  "trips",
  "itineraries",
  "chat_messages",
  "travel_preferences",
  "favorite_destinations",
] as const;

function client(url: string) {
  const c = new pg.Client({
    connectionString: url,
    // Cloud Postgres proxies often use chains Node does not trust by default
    ssl: { rejectUnauthorized: false },
  });
  return c;
}

async function main() {
  const src = client(sourceUrl);
  const dst = client(targetUrl);
  await src.connect();
  await dst.connect();

  const truncateSql = `
    TRUNCATE TABLE
      favorite_destinations,
      travel_preferences,
      chat_messages,
      itineraries,
      trips,
      agent_execution_logs,
      ai_decision_logs,
      admin_action_logs,
      ai_usage_logs,
      rate_limit_entries,
      audit_logs,
      refresh_tokens,
      users
    RESTART IDENTITY CASCADE;
  `;
  console.log("Truncating target app tables…");
  await dst.query(truncateSql);

  for (const table of TABLES) {
    const cols = await src.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    );
    if (cols.rows.length === 0) {
      console.warn(`Skip ${table}: not found on source`);
      continue;
    }
    const names = cols.rows.map((r) => r.column_name);
    const list = names.map((n) => `"${n}"`).join(", ");
    const { rows: rawRows } = await src.query(`SELECT ${list} FROM "${table}"`);
    const byId = new Map<string, (typeof rawRows)[0]>();
    for (const row of rawRows) {
      const id = String((row as { id: string }).id);
      if (!byId.has(id)) byId.set(id, row);
    }
    const rows = [...byId.values()];
    if (rows.length < rawRows.length) {
      console.warn(
        `${table}: deduped ${rawRows.length - rows.length} duplicate primary keys from source`,
      );
    }
    if (rows.length === 0) {
      console.log(`${table}: 0 rows`);
      continue;
    }
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const valueClauses: string[] = [];
      const flatVals: unknown[] = [];
      let p = 1;
      for (const row of chunk) {
        valueClauses.push(
          `(${names.map(() => `$${p++}`).join(", ")})`,
        );
        for (const n of names) flatVals.push(row[n as keyof typeof row]);
      }
      const sql = `INSERT INTO "${table}" (${list}) VALUES ${valueClauses.join(", ")} ON CONFLICT ("id") DO NOTHING`;
      await dst.query(sql, flatVals);
    }
    console.log(`${table}: ${rows.length} rows`);
  }

  await src.end();
  await dst.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
