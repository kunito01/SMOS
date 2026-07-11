import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distName = ".next-pwa";
const distDir = join(projectRoot, distName);
const packageDir = join(projectRoot, "output", "pwa", "studio-map-os-pwa");
const nextBin = join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const licensePath = join(projectRoot, "LICENSE");
const projectNodeModulesDir = join(projectRoot, "node_modules");
const thirdPartyLicenseDirName = "THIRD_PARTY_LICENSES";
const thirdPartyNoticesName = "THIRD_PARTY_NOTICES.txt";
const licenseFilePattern = /^(?:licen[cs]e|copying|notice)(?:$|[._-])/i;
const nextManagedFiles = ["next-env.d.ts", "tsconfig.json"].map((file) => {
  const path = join(projectRoot, file);
  return { path, contents: readFileSync(path) };
});

const readPackageManifest = (manifestPath) => {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read package manifest ${manifestPath}: ${error.message}`);
  }
};

const collectInstalledPackageManifests = (nodeModulesDirectory) => {
  const manifests = [];

  const visitPackage = (packageDirectory) => {
    const manifestPath = join(packageDirectory, "package.json");

    if (!existsSync(manifestPath)) {
      return;
    }

    manifests.push(manifestPath);

    const nestedNodeModules = join(packageDirectory, "node_modules");
    if (existsSync(nestedNodeModules)) {
      visitNodeModules(nestedNodeModules);
    }
  };

  const visitNodeModules = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".bin") {
        continue;
      }

      const entryPath = join(directory, entry.name);

      if (entry.name.startsWith("@")) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          continue;
        }

        for (const scopedPackage of readdirSync(entryPath, { withFileTypes: true })) {
          if (scopedPackage.isDirectory() || scopedPackage.isSymbolicLink()) {
            visitPackage(join(entryPath, scopedPackage.name));
          }
        }
      } else if (entry.isDirectory() || entry.isSymbolicLink()) {
        visitPackage(entryPath);
      }
    }
  };

  visitNodeModules(nodeModulesDirectory);
  return manifests;
};

const findLicenseFiles = (packageDirectory) =>
  readdirSync(packageDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && licenseFilePattern.test(entry.name))
    .map((entry) => join(packageDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right));

const normalizePath = (path) => path.split(sep).join("/");

const formatLicenseField = (license) => {
  if (typeof license === "string" && license.trim()) {
    return license.trim();
  }

  if (license !== undefined && license !== null) {
    return JSON.stringify(license);
  }

  return "not declared";
};

const safeDirectorySegment = (value) =>
  value
    .replace(/^@/, "scope-")
    .replaceAll("/", "--")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "package";

const getMetadataUrl = (value) => {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value.url === "string") {
    return value.url;
  }

  return "";
};

const isNextRepository = (value) =>
  value === "vercel/next.js" || value.includes("github.com/vercel/next.js");

const resolveInheritedLicense = (bundledPackage) => {
  const declaredLicense = formatLicenseField(bundledPackage.license);

  if (bundledPackage.name === "@next/env") {
    const repositoryUrl = getMetadataUrl(bundledPackage.manifest.repository);
    const parentDirectory = join(projectNodeModulesDir, "next");
    const parentManifest = readPackageManifest(join(parentDirectory, "package.json"));
    const parentRepositoryUrl = getMetadataUrl(parentManifest.repository);

    if (
      declaredLicense !== "MIT" ||
      !isNextRepository(repositoryUrl) ||
      !isNextRepository(parentRepositoryUrl) ||
      formatLicenseField(parentManifest.license) !== "MIT"
    ) {
      return null;
    }

    const licenseFiles = findLicenseFiles(parentDirectory);
    return licenseFiles.length > 0
      ? {
          licenseFiles,
          licenseSource:
            "Inherited from next@" +
            (parentManifest.version || "version-not-declared") +
            " (same vercel/next.js repository and MIT license)."
        }
      : null;
  }

  if (bundledPackage.name === "client-only") {
    const homepageUrl = getMetadataUrl(bundledPackage.manifest.homepage);
    const bugsUrl = getMetadataUrl(bundledPackage.manifest.bugs);
    const parentDirectory = join(projectNodeModulesDir, "react");
    const parentManifest = readPackageManifest(join(parentDirectory, "package.json"));
    const parentRepositoryUrl = getMetadataUrl(parentManifest.repository);

    if (
      declaredLicense !== "MIT" ||
      !homepageUrl.includes("reactjs.org") ||
      !bugsUrl.includes("github.com/facebook/react") ||
      !parentRepositoryUrl.includes("github.com/facebook/react") ||
      formatLicenseField(parentManifest.license) !== "MIT"
    ) {
      return null;
    }

    const licenseFiles = findLicenseFiles(parentDirectory);
    return licenseFiles.length > 0
      ? {
          licenseFiles,
          licenseSource:
            "Inherited from react@" +
            (parentManifest.version || "version-not-declared") +
            " (React marker package with facebook/react provenance and MIT license)."
        }
      : null;
  }

  return null;
};

const collectThirdPartyLicenses = () => {
  const bundledNodeModulesDir = join(packageDir, "node_modules");

  if (!existsSync(bundledNodeModulesDir)) {
    throw new Error("The standalone PWA package does not contain node_modules.");
  }

  const sourcePackagesByIdentity = new Map();

  for (const manifestPath of collectInstalledPackageManifests(projectNodeModulesDir)) {
    const manifest = readPackageManifest(manifestPath);

    if (typeof manifest.name !== "string" || !manifest.name.trim()) {
      continue;
    }

    const version = typeof manifest.version === "string" ? manifest.version : "";
    const identity = `${manifest.name}\u0000${version}`;
    const candidates = sourcePackagesByIdentity.get(identity) ?? [];
    candidates.push(manifestPath);
    sourcePackagesByIdentity.set(identity, candidates);
  }

  const bundledPackages = new Map();

  for (const manifestPath of collectInstalledPackageManifests(bundledNodeModulesDir)) {
    const manifest = readPackageManifest(manifestPath);

    if (typeof manifest.name !== "string" || !manifest.name.trim()) {
      continue;
    }

    const version = typeof manifest.version === "string" ? manifest.version : "";
    const identity = `${manifest.name}\u0000${version}`;
    const bundledPath = normalizePath(relative(bundledNodeModulesDir, manifestPath));
    const existing = bundledPackages.get(identity);

    if (existing) {
      existing.bundledPaths.push(bundledPath);
    } else {
      bundledPackages.set(identity, {
        name: manifest.name,
        version,
        license: manifest.license,
        manifest,
        bundledPaths: [bundledPath]
      });
    }
  }

  const resolvedPackages = [];
  const missingLicenses = [];

  for (const [identity, bundledPackage] of bundledPackages) {
    const candidateManifests = sourcePackagesByIdentity.get(identity) ?? [];
    let licenseFiles = [];
    let licenseSource = "Package root.";

    for (const candidateManifest of candidateManifests) {
      const candidateLicenseFiles = findLicenseFiles(dirname(candidateManifest));

      if (candidateLicenseFiles.length > 0) {
        licenseFiles = candidateLicenseFiles;
        break;
      }
    }

    if (licenseFiles.length === 0) {
      const inheritedLicense = resolveInheritedLicense(bundledPackage);

      if (inheritedLicense) {
        licenseFiles = inheritedLicense.licenseFiles;
        licenseSource = inheritedLicense.licenseSource;
      }
    }

    if (licenseFiles.length === 0) {
      missingLicenses.push(
        `${bundledPackage.name}@${bundledPackage.version || "version-not-declared"} ` +
          `(declared license: ${formatLicenseField(bundledPackage.license)}; bundled paths: ` +
          `${bundledPackage.bundledPaths.join(", ")})`
      );
      continue;
    }

    resolvedPackages.push({
      ...bundledPackage,
      licenseFiles,
      licenseSource
    });
  }

  if (missingLicenses.length > 0) {
    throw new Error(
      "Cannot create a compliant PWA package because license files are missing for:\n- " +
        missingLicenses.sort().join("\n- ")
    );
  }

  resolvedPackages.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.version.localeCompare(right.version)
  );

  const thirdPartyLicenseDir = join(packageDir, thirdPartyLicenseDirName);
  mkdirSync(thirdPartyLicenseDir, { recursive: true });

  const noticeSections = [
    "Studio Map OS Third-Party Notices",
    "=================================",
    "",
    "This portable bundle includes the following third-party packages.",
    "The corresponding license and notice texts are stored under",
    `${thirdPartyLicenseDirName}/. Do not remove them when redistributing the bundle.`,
    ""
  ];

  for (const bundledPackage of resolvedPackages) {
    const versionLabel = bundledPackage.version || "version-not-declared";
    const packageLicenseDir = join(
      thirdPartyLicenseDir,
      `${safeDirectorySegment(bundledPackage.name)}-${safeDirectorySegment(versionLabel)}`
    );
    mkdirSync(packageLicenseDir, { recursive: true });

    const copiedFiles = bundledPackage.licenseFiles.map((sourceLicensePath, index) => {
      const sourceName = sourceLicensePath.split(sep).at(-1);
      const safeName = sourceName.replace(/[^A-Za-z0-9._-]+/g, "_");
      const targetName = existsSync(join(packageLicenseDir, safeName))
        ? `${index + 1}-${safeName}`
        : safeName;
      const targetPath = join(packageLicenseDir, targetName);
      cpSync(sourceLicensePath, targetPath);
      return normalizePath(relative(packageDir, targetPath));
    });

    noticeSections.push(
      `Package: ${bundledPackage.name}`,
      `Version: ${versionLabel}`,
      `Declared license: ${formatLicenseField(bundledPackage.license)}`,
      `License source: ${bundledPackage.licenseSource}`,
      "Bundled package manifests:",
      ...bundledPackage.bundledPaths.sort().map((path) => `- node_modules/${path}`),
      "Copied license and notice files:",
      ...copiedFiles.map((path) => `- ${path}`),
      ""
    );
  }

  writeFileSync(join(packageDir, thirdPartyNoticesName), `${noticeSections.join("\n")}\n`);
  return resolvedPackages.length;
};

if (!existsSync(licensePath)) {
  throw new Error("LICENSE is required to create the portable PWA package.");
}

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
cpSync(licensePath, join(packageDir, "LICENSE"));

// Next traces its optional native image optimizer even when image optimization
// is disabled. This bundle uses images.unoptimized and does not need sharp, so
// remove only the copied standalone packages before license collection.
rmSync(join(packageDir, "node_modules", "sharp"), { force: true, recursive: true });
rmSync(join(packageDir, "node_modules", "@img"), { force: true, recursive: true });

const thirdPartyPackageCount = collectThirdPartyLicenses();

writeFileSync(
  join(packageDir, "README.txt"),
  `Studio Map OS Portable PWA Bundle
=================================

Platform and requirement
- macOS on Apple Silicon (arm64)
- Node.js 20 must be installed and available as the "node" command

Start Studio Map OS
1. Extract the complete studio-map-os-pwa.zip archive.
2. Double-click START_STUDIO_MAP_OS.command.
   Or open Terminal in this folder and run:
     ./START_STUDIO_MAP_OS.command
3. Keep the Terminal window open and visit:
     http://127.0.0.1:3002/login
4. Press Control-C in Terminal to stop the local server.

If port 3002 is already in use, choose another port:
  PORT=3003 ./START_STUDIO_MAP_OS.command

Privacy and local data
- Accounts, workspaces, projects, and settings are stored only in this
  browser profile on this Mac, using local browser storage and IndexedDB.
- This bundle does not automatically upload or sync business data to a
  remote backend.
- Clearing browser site data or switching browser profiles can remove access
  to local records. Export encrypted full-device backups regularly and keep
  the 16-digit workspace recovery key in a safe place.

License
See the included LICENSE file for the Apache License 2.0 terms.

Third-party software
See THIRD_PARTY_NOTICES.txt for the bundled dependency list and
THIRD_PARTY_LICENSES/ for the corresponding license and notice texts.
`
);

const launcherPath = join(packageDir, "START_STUDIO_MAP_OS.command");
writeFileSync(
  launcherPath,
  `#!/bin/sh\ncd "$(dirname "$0")"\nPORT="\${PORT:-3002}" HOSTNAME="\${HOSTNAME:-127.0.0.1}" exec node server.js\n`
);
chmodSync(launcherPath, 0o755);

console.log(
  `\nPWA package created at ${packageDir} with licenses for ${thirdPartyPackageCount} third-party packages.`
);
