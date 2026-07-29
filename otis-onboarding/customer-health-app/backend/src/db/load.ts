import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { from as copyFrom } from "pg-copy-streams";
import { pipeline } from "node:stream/promises";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tables we ingest for the Customer Health app. (maintenance_procedures / technicians /
// workforce are omitted as they are not needed for customer-level health analytics.)
const TABLES = [
  "customers",
  "buildings",
  "units",
  "contracts",
  "nps_surveys",
  "callbacks",
  "mcp_compliance",
  "ar_openar",
  "open_orders",
  "otis_one_unit_health",
  "svc_contract_compliance",
  "mechanic_notes",
];

function readHeader(file: string): string[] {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(64 * 1024);
  const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  const text = buf.toString("utf8", 0, bytes);
  const line = text.split(/\r?\n/)[0];
  return line.split(",").map((c) => c.trim());
}

function sanitize(col: string): string {
  return col.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

async function main() {
  if (!config.dataDir) throw new Error("DATA_DIR is not set in .env");

  const client = new pg.Client({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
  });
  await client.connect();
  console.log(`Connected to ${config.pg.database}`);

  for (const table of TABLES) {
    const file = path.join(config.dataDir, `${table}.csv`);
    if (!fs.existsSync(file)) {
      console.warn(`  ! skipping ${table} (file not found)`);
      continue;
    }
    const cols = readHeader(file).map(sanitize);
    const ddlCols = cols.map((c) => `"${c}" text`).join(", ");

    await client.query(`DROP TABLE IF EXISTS raw_${table} CASCADE`);
    await client.query(`CREATE TABLE raw_${table} (${ddlCols})`);

    const stream = client.query(
      copyFrom(
        `COPY raw_${table} FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')`
      )
    );
    const fileStream = fs.createReadStream(file);
    await pipeline(fileStream, stream);

    const { rows } = await client.query(`SELECT count(*)::int AS n FROM raw_${table}`);
    console.log(`  loaded raw_${table}: ${rows[0].n} rows`);
  }

  // Build typed views + the computed customer metrics table.
  const viewsSql = fs.readFileSync(path.join(__dirname, "views.sql"), "utf8");
  await client.query(viewsSql);
  console.log("Created typed views and indexes.");

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
