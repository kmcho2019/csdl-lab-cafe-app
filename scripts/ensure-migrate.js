#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const databaseUrl = process.env.DATABASE_URL;
const skip = process.env.SKIP_PRISMA_MIGRATE === "1";
const strict = process.env.PRISMA_AUTO_MIGRATE_STRICT !== "0";

if (skip) {
  console.log("[migrate] SKIP_PRISMA_MIGRATE=1, skipping automatic migrations.");
  process.exit(0);
}

if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] VERCEL_ENV=${process.env.VERCEL_ENV}; skipping automatic migrations.`);
  process.exit(0);
}

if (!databaseUrl) {
  console.warn("[migrate] DATABASE_URL not set. Skipping automatic prisma migration step.");
  process.exit(0);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf-8",
    ...options,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result;
}

function hasMigrationsDir() {
  const migrationsDir = path.join(__dirname, "..", "prisma", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    return false;
  }
  const entries = fs.readdirSync(migrationsDir);
  return entries.some((entry) => {
    try {
      return fs.statSync(path.join(migrationsDir, entry)).isDirectory();
    } catch {
      return false;
    }
  });
}

function applyMigrations() {
  if (!hasMigrationsDir()) {
    console.warn("[migrate] No prisma/migrations directory found. Skipping migrate deploy.");
    if (strict) {
      console.error("[migrate] Strict mode enabled; aborting without migrations.");
      process.exit(1);
    }
    return false;
  }

  console.log("[migrate] Running `prisma migrate deploy`...");
  const result = runCommand("npx", ["prisma", "migrate", "deploy"]);

  if (result.status === 0) {
    console.log("[migrate] Migrations applied successfully.");
    return true;
  }

  const combinedOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (combinedOutput.includes("P3009")) {
    console.error("[migrate] A previous migration failed. Resolve it with `prisma migrate resolve`.");
  }

  console.error("[migrate] Failed to apply migrations.");
  if (strict) {
    console.error("[migrate] Strict mode enabled; aborting.");
    process.exit(result.status ?? 1);
  }
  return false;
}

const applied = applyMigrations();
if (!applied) {
  console.error("[migrate] Continuing without applying migrations because strict mode is disabled.");
}
