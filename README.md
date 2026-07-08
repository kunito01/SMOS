# Studio Map OS

Studio Map OS is a visual project operating system prototype for creative teams. It maps companies, project groups, projects, phases, deliverables, tasks, materials, versions, activity, people, tools, private costs, and public read-only share pages in one rounded, image-forward workspace.

## Current Routes

- `/login` and `/register`: mock auth entry screens with English default plus Chinese and Japanese switching.
- `/dashboard`: global visual dashboard with All / Company / Project Group scopes.
- `/libraries`: reusable people, software, and cost template libraries.
- `/companies`: company and project-group navigation.
- `/companies/[companyId]`: company overview, groups, and projects.
- `/groups/[groupId]`: project-group overview and projects.
- `/projects`: all project cards.
- `/projects/[projectId]`: project workspace with a timeline board, phases, tools, people, materials, versions, activity, deliverables, and task toggles.
- `/costs`: all-project private cost backend.
- `/projects/[projectId]/costs`: private project cost backend.
- `/projects/[projectId]/share`: internal share settings.
- `/share/[token]`: public read-only share page without login.

## Mock Data And API Boundary

The mock data lives in `lib/mock/data.ts`. API adapters live in `lib/api/`:

- `auth.ts`
- `companies.ts`
- `groups.ts`
- `projects.ts`
- `costs.ts`
- `share.ts`
- `libraries.ts`

Future real backend integration should replace these adapter functions first while keeping the page components stable. The current UI expects Promise-returning functions with the same return shapes. Auth is currently stored in localStorage by `components/providers/app-providers.tsx`; a production backend should replace this with a server session or httpOnly-cookie flow.

## Quality Checks

Run:

```bash
npm run lint
npm run build
```

For local preview:

```bash
npm run dev
```

Then open `http://localhost:3000/dashboard`.

## Implementation Notes

- Private costs are shown only on `/costs` and `/projects/[projectId]/costs`.
- Normal project pages hide cost details and only link to the cost backend.
- Public share pages hide editing controls and contact emails.
- Public share settings can expose read-only people, tools, timeline, deliverables, materials, versions, and limited cost previews.
- Task toggles update mock project progress in `projectsApi.updateTaskCompletion`.
- Share settings are mock-persistent for the running dev process through `shareApi.updateShareSettings`.
- Dashboard `Open Today` opens a focused project action modal.
- Dashboard `Add Project` opens a project creation modal and reuses people, software, and cost templates from `/libraries`.
- Dashboard includes a small-studio ops strip for cash watch, pipeline health, crew load, and client-readiness signals.
- Project timeline boards show concrete phase dates and a blinking `#ff0099` current-time marker when today is inside the project range.
- Library people, software, and cost templates can be added and deleted from `/libraries`.
- Desktop preferences live behind the lower-left gear button; the Next.js dev indicator is disabled in local preview.
- Project, library, and share-setting mutations are persisted in browser localStorage for the prototype session.
