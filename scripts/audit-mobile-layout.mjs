import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const roots = ["apps/web/app", "apps/web/components", "apps/web/app/admin/components"];
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const warnings = [];
const seenFiles = new Set();

function extensionFor(filePath) {
  const match = /\.[^.]+$/.exec(filePath);
  return match?.[0] ?? "";
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "coverage") {
        continue;
      }
      walk(fullPath);
      continue;
    }

    if (!sourceExtensions.has(extensionFor(fullPath))) {
      continue;
    }
    if (/\.(test|spec)\.[jt]sx?$/.test(fullPath) || fullPath.includes("__tests__")) {
      continue;
    }
    seenFiles.add(fullPath);
  }
}

for (const root of roots) {
  walk(root);
}

function warn(filePath, lineNumber, rule, line) {
  warnings.push({
    file: relative(process.cwd(), filePath),
    line: lineNumber,
    rule,
    text: line.trim(),
  });
}

function hasLocalOverflowHandling(line) {
  return /overflow|truncate|break-words|break-all|\[overflow-wrap:anywhere\]/.test(line);
}

for (const filePath of [...seenFiles].sort()) {
  const source = readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const minWidthMatch = /min-w-\[(\d+)px\]/.exec(line);
    const widthMatch = /(?:^|[\s"`'])w-\[(\d+)px\]/.exec(line);

    if (minWidthMatch) {
      warn(filePath, lineNumber, "fixed min-width px", line);
    }
    if (widthMatch && Number(widthMatch[1]) >= 320) {
      warn(filePath, lineNumber, "large fixed width px", line);
    }
    if (/sticky\s+left-0/.test(line)) {
      warn(filePath, lineNumber, "mobile-default sticky left column", line);
    }
    if (/border-collapse/.test(line)) {
      warn(filePath, lineNumber, "table border-collapse", line);
    }
    if (/whitespace-nowrap/.test(line) && !hasLocalOverflowHandling(line)) {
      warn(filePath, lineNumber, "nowrap without local overflow handling", line);
    }
    if (/overflow-hidden/.test(line)) {
      warn(filePath, lineNumber, "overflow-hidden requires layout review", line);
    }
    if (/shrink-0/.test(line) && !/h-\d|w-\d|text-xs|rounded-full/.test(line)) {
      warn(filePath, lineNumber, "shrink-0 requires mobile review", line);
    }
  });

  lines.forEach((line, index) => {
    if (!/<table\b/.test(line)) {
      return;
    }
    const context = lines.slice(Math.max(0, index - 20), index + 1).join("\n");
    if (!/ResponsiveDataScroller|overflow-x-auto/.test(context)) {
      warn(filePath, index + 1, "raw table without explicit horizontal scroller", line);
    }
  });
}

if (warnings.length === 0) {
  console.log("Mobile layout audit: no high-risk patterns found.");
} else {
  console.log(`Mobile layout audit: ${warnings.length} warning(s).`);
  for (const warning of warnings) {
    console.log(`${warning.file}:${warning.line} [${warning.rule}] ${warning.text}`);
  }
}

process.exit(0);
