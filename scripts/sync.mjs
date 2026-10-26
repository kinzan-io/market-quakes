// Mirror the Kinzan market quake archive into this repository.
//
// Fetches https://kinzan.io/data/quakes/index.json and every month it lists,
// writes data/{YYYY}/{YYYY-MM}.json and .csv, data/index.json and
// data/all.csv, and regenerates the coverage and column sections of the
// README. No dependencies: Node 22's fetch is enough.
//
// Two guards, both of which fail the run rather than publish:
//   * the columns must be exactly EXPECTED_COLUMNS. A new column on the site
//     is a decision about what this public dataset contains, so it is made
//     here, by a person, and never picked up by default;
//   * a row already in the repository is never changed or removed. The site
//     serves a month only once it is final, so its rows are frozen. A month
//     may still GAIN rows: when Kinzan starts tracking an instrument, the
//     archive backfills that instrument's past quakes into months already
//     published. Anything other than pure additions fails the run;
//     ALLOW_REWRITE=1 overrides it after a person has looked.
//
// Writes `new_months` and `revised_months` (space separated) to
// $GITHUB_OUTPUT for the release step.

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.KINZAN_DATA_URL || "https://kinzan.io/data/quakes/").replace(/\/?$/, "/");
const ALLOW_REWRITE = process.env.ALLOW_REWRITE === "1";

const EXPECTED_COLUMNS = [
  "key", "date", "prev_date", "instrument", "ticker", "slug", "class", "group", "sigma", "return_pct",
  "vol20_pct", "beats", "larger_since", "measured", "stressed", "url", "instrument_url",
];

function fail(message) {
  console.error(`sync: ${message}`);
  process.exit(1);
}

async function get(url, kind) {
  const res = await fetch(url, { headers: { "User-Agent": "kinzan-io/market-quakes sync" } });
  if (!res.ok) fail(`${url} answered ${res.status}`);
  return kind === "json" ? res.json() : res.text();
}

async function readOrNull(path) {
  return existsSync(path) ? readFile(path, "utf8") : null;
}

/** Replace the text between <!-- name:start --> and <!-- name:end -->. */
function splice(text, name, body) {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
  if (!re.test(text)) fail(`README has no ${name} markers`);
  return text.replace(re, `$1\n${body}\n$2`);
}

const index = await get(`${BASE}index.json`, "json");
const columns = (index.columns ?? []).map((c) => c.name);
if (columns.join(",") !== EXPECTED_COLUMNS.join(",")) {
  fail(`columns changed upstream.\n  expected: ${EXPECTED_COLUMNS.join(",")}\n  received: ${columns.join(",")}\nReview what the new columns contain, then update EXPECTED_COLUMNS.`);
}
if (!Array.isArray(index.months) || index.months.length === 0) fail("the index lists no months");

const added = [];
const revised = [];
const csvBodies = [];
for (const m of index.months) {
  if (!/^\d{4}-\d{2}$/.test(m.month)) fail(`bad month ${JSON.stringify(m.month)}`);
  const [json, csv] = await Promise.all([get(m.json, "json"), get(m.csv, "text")]);
  if (json.month !== m.month || json.count !== m.count || json.quakes?.length !== m.count) fail(`${m.month}: index and file disagree on the count`);
  for (const row of json.quakes) {
    if (Object.keys(row).join(",") !== EXPECTED_COLUMNS.join(",")) fail(`${m.month}: a row carries other columns than expected (${row.key})`);
  }
  const csvLines = csv.split("\r\n").filter(Boolean);
  if (csvLines[0] !== EXPECTED_COLUMNS.join(",") || csvLines.length !== m.count + 1) fail(`${m.month}: the CSV does not match its JSON`);

  const dir = join(ROOT, "data", m.month.slice(0, 4));
  const jsonPath = join(dir, `${m.month}.json`);
  const csvPath = join(dir, `${m.month}.csv`);
  const jsonText = `${JSON.stringify(json, null, 2)}\n`;
  const [oldJson, oldCsv] = await Promise.all([readOrNull(jsonPath), readOrNull(csvPath)]);
  if (oldJson === null && oldCsv === null) {
    added.push(m.month);
  } else if (oldJson !== jsonText || oldCsv !== csv) {
    const before = new Map((JSON.parse(oldJson ?? "{}").quakes ?? []).map((r) => [r.key, JSON.stringify(r)]));
    const after = new Map(json.quakes.map((r) => [r.key, JSON.stringify(r)]));
    const changed = [...before].filter(([k, v]) => after.get(k) !== v).map(([k]) => k);
    if (changed.length && !ALLOW_REWRITE) {
      fail(`${m.month}: published rows changed or vanished upstream (${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ", ..." : ""}). A published row never changes; find out why before re-running with ALLOW_REWRITE=1.`);
    }
    revised.push(m.month);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(jsonPath, jsonText);
  await writeFile(csvPath, csv);
  csvBodies.push(csvLines.slice(1));
}

// One file with every month, for tools that want a single table.
await writeFile(join(ROOT, "data", "all.csv"), [EXPECTED_COLUMNS.join(","), ...csvBodies.flat()].join("\r\n") + "\r\n");
await writeFile(join(ROOT, "data", "index.json"), `${JSON.stringify(index, null, 2)}\n`);

// README: coverage and the column dictionary, both from the index so they cannot drift.
const readmePath = join(ROOT, "README.md");
let readme = await readFile(readmePath, "utf8");
const coverage = [
  `**${index.count} quakes** from ${index.firstDate} to ${index.lastDate}, across ${index.months.length} month${index.months.length === 1 ? "" : "s"}.`,
  "",
  "| Month | Quakes | Files |",
  "|---|---:|---|",
  ...[...index.months].reverse().map((m) => `| ${m.month} | ${m.count} | [CSV](data/${m.month.slice(0, 4)}/${m.month}.csv) · [JSON](data/${m.month.slice(0, 4)}/${m.month}.json) |`),
].join("\n");
const dictionary = ["| Column | Meaning |", "|---|---|", ...index.columns.map((c) => `| \`${c.name}\` | ${c.description.replace(/\|/g, "\\|")} |`)].join("\n");
readme = splice(readme, "coverage", coverage);
readme = splice(readme, "columns", dictionary);
await writeFile(readmePath, readme);

console.log(`sync: ${index.months.length} months, ${index.count} quakes; new: ${added.join(" ") || "none"}; revised: ${revised.join(" ") || "none"}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `new_months=${added.join(" ")}\nrevised_months=${revised.join(" ")}\n`);
