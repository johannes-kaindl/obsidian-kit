#!/usr/bin/env node
// check-no-nul-bytes.mjs — verbietet NUL-Bytes in tracked Textdateien.
//
// Anlass: vault-rag/src/frontmatter.ts trug vier NUL-Bytes in einem String-Literal
// ("\x00BODY\x00" statt " BODY "). Funktional harmlos, aber git und grep stufen die
// Datei damit als binär ein — `grep -r serializeFrontmatter` fand sie nicht mehr,
// und genau davon lebt der Kit-first-Vorher-Check.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEXT_EXT = /\.(ts|js|mjs|md|json|css|yml)$/;

let files;
try {
  files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && TEXT_EXT.test(f));
} catch (err) {
  console.error(`check-no-nul-bytes: git ls-files schlug fehl: ${err.message}`);
  process.exit(2);
}

const hits = [];
for (const file of files) {
  let buf;
  try {
    buf = readFileSync(file);
  } catch (err) {
    console.error(`check-no-nul-bytes: ${file} nicht lesbar: ${err.message}`);
    process.exit(2);
  }
  const at = buf.indexOf(0);
  if (at !== -1) hits.push(`${file}: NUL-Byte an Offset ${at}`);
}

if (hits.length > 0) {
  console.error("check-no-nul-bytes: NUL-Bytes in tracked Textdateien:");
  for (const h of hits) console.error(`  ${h}`);
  console.error("Diese Dateien gelten als binär — grep/git-grep finden ihren Inhalt nicht.");
  process.exit(1);
}

console.log(`check-no-nul-bytes: OK — ${files.length} Textdateien ohne NUL-Bytes`);
