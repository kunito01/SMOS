<p align="center">
  <img src="./app/icon.svg" width="104" alt="Studio Map OS logo" />
</p>

<h1 align="center">Studio Map OS</h1>

<p align="center"><strong>CREATIVE PROJECT OPERATING SYSTEM</strong></p>

---

<p align="center">
  <strong>English</strong> · 中文 · 日本語 · Español · Português · Deutsch · Français · 한국어 · ไทย
</p>

<p align="center">
  <strong>Let a one-person studio run like a complete team.</strong><br />
  A local-first visual project operating system for independent creators and one-person companies.
</p>

<p align="center">
  <em>Map brands, project groups, projects, people, tools, costs, releases, and archives in one rounded visual workspace.</em>
</p>

<p align="center">
  <a href="https://github.com/kunito01/SMOS/stargazers"><img src="https://img.shields.io/github/stars/kunito01/SMOS?style=flat-square&color=03b5aa" alt="GitHub stars" /></a>
  <a href="https://github.com/kunito01/SMOS/forks"><img src="https://img.shields.io/github/forks/kunito01/SMOS?style=flat-square&color=ffca0a" alt="GitHub forks" /></a>
  <a href="https://github.com/kunito01/SMOS/issues"><img src="https://img.shields.io/github/issues/kunito01/SMOS?style=flat-square&color=f7567c" alt="GitHub issues" /></a>
  <img src="https://img.shields.io/github/last-commit/kunito01/SMOS?style=flat-square&color=ff4a2f" alt="Last commit" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-1c2328?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-03b5aa?style=flat-square&logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript 5.7" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3.4-ffca0a?style=flat-square&logo=tailwindcss&logoColor=1c2328" alt="Tailwind CSS 3.4" />
  <img src="https://img.shields.io/badge/languages-9-f7567c?style=flat-square" alt="Nine interface languages" />
  <img src="https://img.shields.io/badge/data-local--first-e9e5df?style=flat-square" alt="Local-first data" />
</p>

<br />

## Overview

Studio Map OS brings the operating structure of a full creative team into a workspace designed for one person. Brands, project groups, active work, people, software, costs, timelines, releases, archives, and reusable templates stay connected without flattening the work into a generic task list.

The current version is a browser-based product demo with local persistence. It is designed as a clear frontend and data-model foundation for a future authenticated backend.

## Highlights

| Visual project operations | Local data control |
| --- | --- |
| Dashboard scopes for all work, one brand, or one project group | Full-site JSON backup and restore |
| Project status, timeline, deliverables, releases, and archive flow | Individual project save and load files |
| Reusable people, software, and cost-template libraries | Browser-local persistence for demo data |
| Currency-aware cost totals with exchange-rate conversion | Public read-only share settings with private data controls |
| Responsive desktop, tablet, and narrow mobile layouts | Nine complete interface languages |

## Screenshots

### 01 · Sign in

<p align="center">
  <img src="./refs/01.png" width="100%" alt="Sign-in page with the Studio Map OS city scene" />
</p>

### 02 · Project index

<p align="center">
  <img src="./refs/02.png" width="100%" alt="Project index with visual project cards and release labels" />
</p>

### 03 · People, software, and cost libraries

<p align="center">
  <img src="./refs/03.png" width="100%" alt="Reusable people, software, and cost-template libraries" />
</p>

### 04 · Studio dashboard

<p align="center">
  <img src="./refs/04.png" width="100%" alt="Studio dashboard with project metrics and active maps" />
</p>

### 05 · Project timeline board

<p align="center">
  <img src="./refs/05.png" width="100%" alt="Project timeline board with stages, targets, tasks, and the current-time marker" />
</p>

## Core capabilities

- **Brands and project groups** — organize different lines of work without tying project-group types to a single brand.
- **Project workspaces** — track status, stages, targets, tasks, people, tools, deliverables, materials, versions, and release nodes.
- **Visual timeline** — drag horizontally through project stages while the label column stays visible.
- **Cost operations** — combine personnel, software, outsourcing, asset, and server costs across supported currencies.
- **Libraries** — save reusable people, subscriptions, software tools, and cost templates for new projects.
- **Archive and portability** — archive projects without deleting them, export individual projects, or move the whole workspace between computers with a JSON backup.
- **Public sharing** — generate controlled read-only project pages while keeping private contact and cost data hidden by default.
- **International interface** — complete English, Chinese, Japanese, Spanish, Portuguese, German, French, Korean, and Thai dictionaries.

## Local setup

```bash
git clone https://github.com/kunito01/SMOS.git
cd SMOS
npm install
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login). The demo account is prefilled as `studio@example.com`; enter any password to open the workspace.

## Quality checks

```bash
npm run lint
npx tsc --noEmit
```

## Main routes

| Route | Purpose |
| --- | --- |
| `/dashboard` | Studio overview, scopes, project metrics, and active maps |
| `/companies` | Brands and project-group management |
| `/projects` | Complete visual project index |
| `/projects/[projectId]` | Project status, timeline, releases, content, and settings |
| `/costs` | Portfolio-level cost view and final display currency |
| `/libraries` | People, software, subscriptions, and reusable cost templates |
| `/archive` | Archived projects plus full-site backup and restore |

## Architecture notes

- Built with Next.js 15, React 19, TypeScript, Tailwind CSS, Framer Motion, and Lucide icons.
- Mock API adapters live in `lib/api/`; demo seed data lives in `lib/mock/`.
- Browser persistence and backup parsing are centralized in `lib/api/mock-persistence.ts`.
- The exchange-rate endpoint uses a live reference source when available and falls back safely when offline.
- Private project costs remain separated from public read-only share pages.

---

<p align="center">
  <strong>Studio Map OS</strong><br />
  Copyright © 2026 Colorinu Games Limited. All rights reserved.<br />
  <a href="mailto:kunito.world@icloud.com">kunito.world@icloud.com</a>
</p>
