// Gera o sidecar: esbuild (um arquivo CJS) + Node SEA → desktop/binaries/patchbay-api-<target-triple>
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const dist = new URL("../dist/", import.meta.url).pathname;
const bins = new URL("../../desktop/binaries/", import.meta.url).pathname;
const triple = execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
const out = `${bins}patchbay-api-${triple}`;

await build({
  entryPoints: [new URL("../src/server.ts", import.meta.url).pathname],
  outfile: `${dist}server.cjs`,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: true,
});

writeFileSync(
  `${dist}sea-config.json`,
  JSON.stringify({
    main: `${dist}server.cjs`,
    output: `${dist}sea-prep.blob`,
    disableExperimentalSEAWarning: true,
  }),
);
execFileSync(process.execPath, ["--experimental-sea-config", `${dist}sea-config.json`], {
  stdio: "inherit",
});

mkdirSync(bins, { recursive: true });
copyFileSync(process.execPath, out);
execFileSync(
  "npx",
  [
    "postject",
    out,
    "NODE_SEA_BLOB",
    `${dist}sea-prep.blob`,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ],
  { stdio: "inherit" },
);
console.log(`sidecar: ${out}`);
