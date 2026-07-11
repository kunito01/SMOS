"use client";

import { useSearchParams } from "next/navigation";
import { ProjectCostsPage } from "@/components/costs/project-costs-page";
import { MissingQueryRedirect } from "@/components/routes/query-route-states";

export function ProjectCostsQueryRoute() {
  const projectId = useSearchParams().get("projectId")?.trim();

  return projectId ? <ProjectCostsPage projectId={projectId} /> : <MissingQueryRedirect href="/projects" />;
}
