import { build as esbuild } from "esbuild";
import { readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
// NOTE: drizzle-orm and drizzle-zod are excluded from bundling
// because they cause runtime errors when minified
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildServer() {
  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    sourcemap: true, // Enable source maps for Sentry
    external: externals,
    logLevel: "info",
  });
}

buildServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
