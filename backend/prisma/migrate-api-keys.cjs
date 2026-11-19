const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

// Prisma exécute le hachage des clés existantes dans la transaction de migration.
const migration = spawnSync(process.execPath, [
  require.resolve("prisma"),
  "migrate", "deploy",
  "--schema", join(__dirname, "schema.prisma"),
], { stdio: "inherit" });

if (migration.error) {
  console.error(migration.error.message);
}
process.exitCode = migration.status ?? 1;
