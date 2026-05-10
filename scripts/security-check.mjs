import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const FORBIDDEN_PUBLIC_KEYS = [
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_ANTHROPIC_API_KEY",
];

const FORBIDDEN_SECRET_REFERENCES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_ANTHROPIC_API_KEY",
];

async function walk(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".git"].includes(entry.name)) {
        continue;
      }

      files.push(...(await walk(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

async function checkEnvFiles(issues) {
  const files = await walk(ROOT);
  const envFiles = files.filter((file) => /(^|\\|\/)\.env(\.|$)/.test(file));

  for (const envFile of envFiles) {
    const text = await readFile(envFile, "utf8");
    for (const key of FORBIDDEN_PUBLIC_KEYS) {
      if (text.includes(`${key}=`)) {
        issues.push(
          `Forbidden public secret key declaration in ${path.relative(ROOT, envFile)}: ${key}`,
        );
      }
    }
  }
}

function isClientModule(source) {
  const trimmed = source.trimStart();
  return (
    trimmed.startsWith('"use client"') ||
    trimmed.startsWith("'use client'")
  );
}

async function checkClientFiles(issues) {
  const files = await walk(path.join(ROOT, "src"));
  const candidateFiles = files.filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));

  for (const file of candidateFiles) {
    const source = await readFile(file, "utf8");
    const normalizedPath = file.replace(/\\/g, "/");
    const isClientReachable =
      normalizedPath.includes("/src/app/") ||
      normalizedPath.includes("/src/components/") ||
      isClientModule(source);

    if (!isClientReachable) {
      continue;
    }

    for (const key of FORBIDDEN_SECRET_REFERENCES) {
      if (source.includes(key)) {
        issues.push(
          `Client module references sensitive key in ${path.relative(ROOT, file)}: ${key}`,
        );
      }
    }
  }
}

async function main() {
  const issues = [];

  await checkEnvFiles(issues);
  await checkClientFiles(issues);

  if (issues.length > 0) {
    console.error("Security baseline check failed:\n");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log("Security baseline check passed.");
}

await main();
