#!/usr/bin/env node
/**
 * Extracts population data from PSGC-MCP KV files and builds a lightweight
 * lookup table for region, province, city, and municipality levels.
 *
 * Source: Philippine Statistics Authority (PSA) 2024 Census of Population
 * via PSGC Q4 2025 Publication
 *
 * Input:  ../PSGC-MCP/scripts/data/output/kv-*.json
 * Output: data/population.json
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PSGC_DIR = join(__dirname, "../../PSGC-MCP/scripts/data/output");
const OUTPUT = join(__dirname, "../data/population.json");

const INCLUDED_LEVELS = new Set(["Reg", "Prov", "Dist", "City", "Mun", "SubMun"]);

const kvFiles = readdirSync(PSGC_DIR)
  .filter((f) => f.startsWith("kv-") && f.endsWith(".json"))
  .sort();

console.log(`Reading ${kvFiles.length} KV files from ${PSGC_DIR}...`);

const lookup = {};
let totalRead = 0;
let included = 0;
let skippedNoPopulation = 0;

for (const file of kvFiles) {
  const entries = JSON.parse(readFileSync(join(PSGC_DIR, file), "utf-8"));
  totalRead += entries.length;

  for (const entry of entries) {
    if (!entry.key.startsWith("entity:")) continue;

    const entity = JSON.parse(entry.value);
    if (!INCLUDED_LEVELS.has(entity.level)) continue;
    if (entity.population == null) {
      skippedNoPopulation++;
      continue;
    }

    lookup[entity.code] = {
      name: entity.name,
      level: entity.level,
      population: entity.population,
      region_code: entity.regionCode,
      province_code: entity.provinceCode,
    };
    included++;
  }
}

writeFileSync(OUTPUT, JSON.stringify(lookup, null, 2));

const stats = {
  total_kv_entries: totalRead,
  included_entities: included,
  skipped_no_population: skippedNoPopulation,
  by_level: {},
};

for (const entry of Object.values(lookup)) {
  stats.by_level[entry.level] = (stats.by_level[entry.level] || 0) + 1;
}

console.log("\nPopulation lookup built:");
console.log(`  Total KV entries read: ${totalRead}`);
console.log(`  Included entities:     ${included}`);
console.log(`  Skipped (no pop):      ${skippedNoPopulation}`);
console.log(`  By level:`);
for (const [level, count] of Object.entries(stats.by_level)) {
  console.log(`    ${level}: ${count}`);
}
console.log(`\nWritten to ${OUTPUT}`);
