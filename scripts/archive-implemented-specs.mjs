import { promises as fs } from "node:fs";
import path from "node:path";

const SPECS_DIR = path.join(process.cwd(), "docs", "specs");
const ARCHIVE_DIR = path.join(process.cwd(), "docs", "archive");
const DRY_RUN = process.argv.includes("--dry-run");

function isMarkdownFile(fileName) {
  return fileName.toLowerCase().endsWith(".md");
}

function isImplementedSpec(content) {
  return /(^|\n)-\s*Implemented\s*$/m.test(content);
}

function extractYearMonth(content) {
  const match = content.match(/(^|\n)-\s*Date:\s*(\d{4})-(\d{2})-\d{2}\s*$/m);
  if (match) {
    return `${match[2]}-${match[3]}`;
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function hasYearMonthPrefix(fileName) {
  return /^\d{4}-\d{2}-/.test(fileName);
}

async function ensureUniquePath(targetPath) {
  try {
    await fs.access(targetPath);
  } catch {
    return targetPath;
  }

  const ext = path.extname(targetPath);
  const base = targetPath.slice(0, -ext.length);
  let index = 2;

  while (true) {
    const candidate = `${base}-${index}${ext}`;
    try {
      await fs.access(candidate);
      index += 1;
    } catch {
      return candidate;
    }
  }
}

async function main() {
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });

  const entries = await fs.readdir(SPECS_DIR, { withFileTypes: true });
  const mdFiles = entries.filter((entry) => entry.isFile() && isMarkdownFile(entry.name));

  const moved = [];

  for (const file of mdFiles) {
    const sourcePath = path.join(SPECS_DIR, file.name);
    const content = await fs.readFile(sourcePath, "utf8");

    if (!isImplementedSpec(content)) {
      continue;
    }

    const yearMonth = extractYearMonth(content);
    const archiveFileName = hasYearMonthPrefix(file.name) ? file.name : `${yearMonth}-${file.name}`;
    const tentativeTarget = path.join(ARCHIVE_DIR, archiveFileName);
    const targetPath = await ensureUniquePath(tentativeTarget);

    if (!DRY_RUN) {
      await fs.rename(sourcePath, targetPath);
    }

    moved.push({ sourcePath, targetPath });
  }

  if (moved.length === 0) {
    console.log("No implemented specs found in docs/specs.");
    return;
  }

  for (const item of moved) {
    console.log(`${DRY_RUN ? "[dry-run] " : ""}Moved: ${path.relative(process.cwd(), item.sourcePath)} -> ${path.relative(process.cwd(), item.targetPath)}`);
  }
}

main().catch((error) => {
  console.error("Failed to archive implemented specs:", error);
  process.exitCode = 1;
});
