<p align="center">
  <img src="./app/icon.svg" width="104" alt="Studio Map OS logo" />
</p>

<h1 align="center">Studio Map OS</h1>

<p align="center"><strong>CREATIVE PROJECT OPERATING SYSTEM</strong></p>

<p align="center">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.es.md">Español</a> · <a href="./README.pt-BR.md">Português</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.tr.md">Türkçe</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.th.md">ไทย</a>
</p>

<p align="center">
  <strong>Let a one-person studio run like a complete team.</strong><br />
  A local-first visual project operating system for independent creators and one-person companies.
</p>

<p align="center">
  <a href="https://kunito01.github.io/SMOS/login/"><img src="./docs/readme/live-demo.svg" alt="Open Live Demo" /></a>
  <a href="https://github.com/kunito01/SMOS/releases/latest"><img src="./docs/readme/download-pwa.svg" alt="Download portable PWA" /></a>
</p>

<p align="center">
  <a href="https://github.com/kunito01/SMOS/stargazers"><img src="https://img.shields.io/github/stars/kunito01/SMOS?style=flat-square&color=03b5aa" alt="GitHub stars" /></a>
  <a href="https://github.com/kunito01/SMOS/forks"><img src="https://img.shields.io/github/forks/kunito01/SMOS?style=flat-square&color=ffca0a" alt="GitHub forks" /></a>
  <a href="https://github.com/kunito01/SMOS/issues"><img src="https://img.shields.io/github/issues/kunito01/SMOS?style=flat-square&color=f7567c" alt="GitHub issues" /></a>
  <img src="https://img.shields.io/badge/Next.js-15-1c2328?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-03b5aa?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square&logo=pwa&logoColor=white" alt="Installable PWA" />
  <img src="https://img.shields.io/badge/data-local--first-e9e5df?style=flat-square" alt="Local-first data" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-03b5aa?style=flat-square" alt="Apache License 2.0" /></a>
</p>

---

## Overview

Studio Map OS connects brands, project groups, projects, people, software, costs, timelines, release checkpoints, and archives in one visual workspace. It helps independent creators operate several parallel projects without flattening the creative process into a generic task list.

The current version is an installable, local-first PWA. Business data stays on the device, is encrypted with Web Crypto, and is persisted in IndexedDB. The Web App Manifest, Service Worker, offline fallback, application icons, and standalone packaging workflow are integrated. Accounts, recovery keys, and backups are also handled in the browser; a remote business backend and server authentication are not connected yet.

## Screenshots

![01 — Sign-in and encrypted full-site backup entry](./docs/screenshots/01.png)

![02 — All-project index and visual project cards](./docs/screenshots/02.png)

![03 — People, software, and cost-template libraries](./docs/screenshots/03.png)

## Core capabilities

| Project operations | Local data control |
| --- | --- |
| Studio-wide, brand, and project-group dashboard scopes | Local accounts and workspace recovery keys |
| Project status, stages, tasks, timelines, and releases | Encrypted IndexedDB workspace records |
| Phase budgets, receivables, and multi-currency totals | Encrypted device, workspace, and project backups |
| People, software subscriptions, and cost-template libraries | Legacy browser-data migration and transactional recovery |
| Project archive, restore, and permanent deletion | Field-controlled read-only share snapshots |
| Desktop, tablet, and narrow-mobile layouts | Installable PWA, offline fallback, and eleven interface languages |

## Main features

- **Brands and project groups** — establish distinct brands and organize work with reusable project-group types.
- **Project workspaces** — track status, stages, goals, tasks, people, tools, materials, versions, and activity records.
- **Visual timelines** — configure phase dates, tasks, owners, tools, notes, and custom rows for each project.
- **Structured budgets** — plan personnel, travel, daily expenses, outsourcing, additional costs, and software by phase, including tax and contingency.
- **Costs and receivables** — consolidate budgets, actual costs, software subscriptions, and project payment schedules.
- **Reusable libraries** — maintain people, software tools, subscriptions, and cost templates.
- **Archive and portability** — archive projects, export an individual project, or back up all Studio Map OS data in the browser.
- **Read-only sharing** — choose whether a project snapshot includes timelines, deliverables, people, tools, materials, versions, and cost previews.
- **International interface** — use English, Simplified Chinese, Japanese, Spanish, Portuguese, German, French, Russian, Turkish, Korean, or Thai.

## Technology

- Next.js 15 with the App Router
- React 19
- TypeScript
- Tailwind CSS
- Framer Motion
- Lucide Icons
- Serwist Service Worker
- Web Crypto API
- IndexedDB and Local Storage

## PWA support

Studio Map OS includes a complete PWA integration structure:

- A Web App Manifest with `standalone` display mode and `/login` as the start URL.
- 192×192, 512×512, maskable, and Apple Touch icons.
- Automatic Service Worker registration and runtime caching powered by Serwist.
- Precaching for the root, login, registration, offline page, manifest, brand asset, and PWA icons.
- A document-navigation fallback at `/offline`.
- iOS home-screen metadata, theme colors, and `viewport-fit=cover`.
- A portable PWA bundle containing the standalone Next.js server, static assets, and a launch script.

> [!NOTE]
> Development mode disables the Service Worker to prevent stale caches from interfering with development. Verify installation, caching, and offline behavior with a production build on `localhost` or HTTPS.

## Getting started

### Requirements

- Node.js 20 LTS recommended
- npm
- A modern browser with Web Crypto and IndexedDB support

### Install and run

```bash
git clone https://github.com/kunito01/SMOS.git
cd SMOS
npm install
npm run dev
```

Open [http://localhost:3000/register](http://localhost:3000/register) to create the first local account.

On first use:

1. Enter a name, email address, and a password of at least eight characters.
2. Create a new workspace.
3. Immediately copy or download the generated 16-digit workspace recovery key.
4. Confirm that the recovery key is stored safely before entering the workspace.

> [!IMPORTANT]
> The recovery key is not stored in plaintext with the account. If the password and recovery key are both lost and no usable backup remains, the workspace data may be unrecoverable.

Existing local accounts can sign in at [http://localhost:3000/login](http://localhost:3000/login). There is no preconfigured account that accepts an arbitrary password.

### Production mode and PWA verification

```bash
npm run build
npm run start
```

Open [http://localhost:3000/login](http://localhost:3000/login) in a PWA-capable browser to inspect the Manifest, Service Worker, and installation entry point. Browsers treat `localhost` as a secure context; production deployments should use HTTPS.

### Create a portable PWA bundle

```bash
npm run package:pwa
```

The bundle is written to `output/pwa/studio-map-os-pwa/`. It includes the standalone server, PWA assets, and launch scripts for Windows (`START_STUDIO_MAP_OS.bat`), macOS (`START_STUDIO_MAP_OS.command`), and Linux/macOS terminals (`START_STUDIO_MAP_OS.sh`). All launchers use `127.0.0.1:3002` by default.

## Main routes

| Route | Purpose |
| --- | --- |
| `/register` | Create a local account and workspace, or join one with an encrypted backup |
| `/login` | Unlock a local account or restore a full-device backup |
| `/offline` | Document fallback when Service Worker navigation fails |
| `/dashboard` | Studio overview, scopes, metrics, and project maps |
| `/companies` | Brand and project-group management |
| `/company/?companyId=...` | Brand details and linked project summaries |
| `/projects` | All active projects |
| `/project/?projectId=...` | Project status, timeline, releases, receivables, and settings |
| `/project-costs/?projectId=...` | Project budget and cost details |
| `/project-share/?projectId=...` | Read-only share-field settings |
| `/costs` | Studio-level cost totals and display-currency settings |
| `/libraries` | People, software subscriptions, and cost-template libraries |
| `/archive` | Archived projects plus device and workspace backup recovery |
| `/share/?token=...` | Local read-only project snapshot |

## Data and security model

```text
React pages
    ↓
Local adapters in lib/api
    ↓
In-memory business database
    ↓
Web Crypto encryption
    ↓
IndexedDB persistence
```

- Business data is isolated by workspace and stored as encrypted IndexedDB records.
- A password unlocks the protected workspace master key; the master key is used only in memory after sign-in.
- The 16-digit recovery key can recover the workspace master key and unlock encrypted backup files.
- Workspace records and backup envelopes use browser cryptography including PBKDF2, HKDF, and AES-GCM.
- A full-device backup contains local accounts, workspaces, preferences, and encrypted database snapshots. Workspace and project exports are encrypted too.
- Browsers may decline persistent-storage requests, so encrypted backups remain an essential part of data protection.

> [!WARNING]
> These mechanisms have not undergone an independent security audit. They are not a substitute for professional key management, server backups, or enterprise identity systems.

## Multi-currency costs

The current calculation and display currencies are:

- CNY — Chinese yuan
- USD — US dollar
- JPY — Japanese yen
- EUR — Euro

The application requests reference rates directly in the browser from Frankfurter's ECB-backed service, then falls back to a recent browser cache or bundled rates. Exchange rates are intended for internal studio estimates, not settlement or financial advice.

## Backup files

| Type | Contents | Typical filename |
| --- | --- | --- |
| Full-device backup | All local accounts, workspaces, preferences, and encrypted data | `studio-map-os-*.smos-backup.json` |
| Workspace backup | Current workspace business data and preferences | `studio-map-os-workspace-*.smos-backup.json` |
| Project file | One project snapshot | `studio-map-os-project-*.smos-project.json` |

Verify the backup type and recovery key before restoring. A full-device restore may replace existing Studio Map OS data in the current browser.

## Current public-sharing boundary

Read-only share records currently stay in the browser and website origin that generated them. A share URL can be opened locally, but the data is not automatically published to a remote server. As a result:

- A link may stop working in a different browser, after site data is cleared, or on another device.
- This capability is not yet equivalent to an internet-hosted public page.
- Cross-device sharing will require remote storage, access control, and revocation infrastructure.

## Internationalization

The interface supports eleven languages. Locale files fall back to English when a dedicated key is unavailable; the Russian and Turkish dictionaries currently cover every translation key. Translation coverage and wording improvements are welcome through Issues and Pull Requests.

## Project structure

```text
app/                  Next.js routes, Manifest, Service Worker, and static PWA entry points
components/           Pages, product modules, layout, and shared UI
lib/api/              Local business API adapters
lib/i18n/             Interface dictionaries and domain labels
lib/mock/             Demo seed data and aggregation logic
lib/security/         Workspace and public-share encryption
lib/storage/          IndexedDB and persistent-storage support
lib/types/            Domain models
lib/utils/            Budget, currency, phase, and release utilities
public/               Brand assets, PWA icons, and generated Worker bundles
scripts/              Portable PWA build and packaging scripts
```

## Quality checks

```bash
npm run lint
npx tsc --noEmit --incremental false
```

The repository does not yet include automated unit or end-to-end tests. Changes to encryption, migration, recovery, or budget calculations should receive additional verification before merging.

## Current limitations

- Business APIs are still browser-local adapters; no production server backend is connected.
- New projects inherit parts of the demo-project structure instead of starting from a completely blank template.
- Editing flows for actual costs, materials, and activity records are not fully exposed.
- Project-group details, share revocation, and link-expiration controls still need wiring.
- A full page refresh requires the password to unlock the workspace again.
- PWA support is integrated, but automated Lighthouse, installation-flow, and offline end-to-end tests are not configured yet.
- Uncached dynamic pages and live network endpoints may still be unavailable offline; the offline fallback and local data do not replace remote APIs.

## Contributing

Issues and Pull Requests are welcome. Before submitting a change:

1. Describe the affected page, data model, or migration scope.
2. Check both desktop and narrow-screen layouts.
3. Run ESLint and the TypeScript check.
4. Document backward compatibility and backup recovery for data-format changes.

## License

Studio Map OS is licensed under the [Apache License 2.0](./LICENSE). You may use, reproduce, modify, and distribute the project in compliance with the license terms.

<p align="center">
  <strong>Studio Map OS</strong><br />
  Copyright © 2026 Colorinu Games Limited. All rights reserved.<br />
  <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a>
</p>
