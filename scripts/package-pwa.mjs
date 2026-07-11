import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distName = ".next-pwa";
const distDir = join(projectRoot, distName);
const packageDir = join(projectRoot, "output", "pwa", "studio-map-os-pwa");
const nextBin = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const nextManagedFiles = ["next-env.d.ts", "tsconfig.json"].map((file) => {
  const path = join(projectRoot, file);
  return { path, contents: readFileSync(path) };
});

rmSync(distDir, { force: true, recursive: true });

let build;

try {
  build = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NEXT_DIST_DIR: distName,
      STUDIO_MAP_PWA_BUNDLE: "1"
    },
    stdio: "inherit"
  });
} finally {
  for (const file of nextManagedFiles) {
    writeFileSync(file.path, file.contents);
  }
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const standaloneDir = join(distDir, "standalone");

if (!existsSync(join(standaloneDir, "server.js"))) {
  throw new Error("The standalone PWA server was not created.");
}

rmSync(packageDir, { force: true, recursive: true });
mkdirSync(packageDir, { recursive: true });
cpSync(standaloneDir, packageDir, { recursive: true });
cpSync(join(projectRoot, "public"), join(packageDir, "public"), { recursive: true });
mkdirSync(join(packageDir, distName), { recursive: true });
cpSync(join(distDir, "static"), join(packageDir, distName, "static"), { recursive: true });

const launcherPath = join(packageDir, "START_STUDIO_MAP_OS.command");
writeFileSync(
  launcherPath,
  `#!/bin/sh\ncd "$(dirname "$0")"\nPORT="\${PORT:-3002}" HOSTNAME="\${HOSTNAME:-127.0.0.1}" exec node server.js\n`
);
chmodSync(launcherPath, 0o755);

console.log(`\nPWA package created at ${packageDir}`);
