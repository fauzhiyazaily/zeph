import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const appRoot = process.cwd();
const workspaceRoot = resolve(appRoot, "..");

const scanRoots = [
  resolve(appRoot, "src/lib/ingestion"),
  resolve(appRoot, "src/lib/transactions"),
  resolve(appRoot, "src/app/api/ingestion"),
  resolve(appRoot, "src/shared/ingestion"),
  resolve(workspaceRoot, "shared/ingestion/sources"),
];

const allowedExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);

const requiredCanonicalImports = new Map([
  ["src/lib/ingestion/payment-message.ts", "@/shared/ingestion/index"],
  ["src/lib/ingestion/bank-statements.ts", "@/shared/ingestion/index"],
  ["src/lib/ingestion/dead-letter.ts", "@/shared/ingestion/index"],
  ["src/lib/ingestion/health.ts", "@/shared/ingestion/index"],
  ["src/lib/transactions/persistence.ts", "@/shared/ingestion/index"],
  ["src/shared/ingestion/index.ts", "shared/ingestion/index.js"],
  ["../shared/ingestion/sources/csvSourceAdapter.js", "../index.js"],
  ["../shared/ingestion/sources/smsSourceAdapter.js", "../index.js"],
  ["../shared/ingestion/sources/bankApiSourceAdapter.js", "../index.js"],
  ["../shared/ingestion/sources/ocrSourceAdapter.js", "../index.js"],
  ["../shared/ingestion/sources/manualEntrySourceAdapter.js", "../index.js"],
]);

const errors = [];

function walkFiles(rootPath, files = []) {
  const children = readdirSync(rootPath);
  for (const child of children) {
    const fullPath = join(rootPath, child);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkFiles(fullPath, files);
      continue;
    }
    if (!allowedExtensions.has(extname(fullPath))) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

function normalizeRelativePath(filePath) {
  const fromApp = relative(appRoot, filePath).replace(/\\/g, "/");
  if (!fromApp.startsWith("../")) {
    return fromApp;
  }
  const fromWorkspace = relative(workspaceRoot, filePath).replace(/\\/g, "/");
  return `../${fromWorkspace}`;
}

function isCanonicalSharedIngestionImport(importPath) {
  return (
    importPath === "@/shared/ingestion/index" ||
    importPath === "@/shared/ingestion/index.js" ||
    importPath === "../../../../shared/ingestion/index.js" ||
    importPath === "../index.js" ||
    importPath.endsWith("/shared/ingestion/index") ||
    importPath.endsWith("/shared/ingestion/index.js")
  );
}

function collectImports(content) {
  const imports = [];
  const importRegex = /(?:import\s+[^"']*from\s+|export\s+[^"']*from\s+|require\s*\()\s*["']([^"']+)["']/g;
  let match = importRegex.exec(content);
  while (match) {
    imports.push(match[1]);
    match = importRegex.exec(content);
  }
  return imports;
}

const allFiles = scanRoots.flatMap((root) => walkFiles(root));

for (const fullPath of allFiles) {
  const content = readFileSync(fullPath, "utf8");
  const relativePath = normalizeRelativePath(fullPath);
  const imports = collectImports(content);

  for (const importPath of imports) {
    if (!importPath.includes("shared/ingestion")) {
      continue;
    }

    if (!isCanonicalSharedIngestionImport(importPath)) {
      errors.push(`${relativePath} imports non-canonical ingestion path: ${importPath}`);
    }
  }

  const requiredImport = requiredCanonicalImports.get(relativePath);
  if (requiredImport && !content.includes(requiredImport)) {
    errors.push(`${relativePath} must import from canonical path containing: ${requiredImport}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log("Ingestion governance import checks passed.");
