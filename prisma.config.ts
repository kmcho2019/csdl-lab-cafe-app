import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  seed: "ts-node --compiler-options '{\"module\":\"CommonJS\"}' prisma/seed.ts",
});
