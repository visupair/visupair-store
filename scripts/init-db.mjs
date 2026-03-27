#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, "..", "schema.sql");

if (!fs.existsSync(schemaPath)) {
  console.error("❌ schema.sql not found!");
  process.exit(1);
}

const schema = fs.readFileSync(schemaPath, "utf-8");

console.log("📦 Initializing D1 database...\n");

try {
  // Apply schema using wrangler
  execSync(`npx wrangler d1 execute visupair-store --file="${schemaPath}"`, {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });

  console.log("\n✅ Database initialized successfully!");
  console.log("📝 Tables created:");
  console.log("   - user");
  console.log("   - session");
  console.log("   - account");
  console.log("   - verification");
} catch (error) {
  console.error("❌ Failed to initialize database:", error.message);
  process.exit(1);
}
