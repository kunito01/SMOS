"use client";

import { useSearchParams } from "next/navigation";
import { ProjectDetailPage } from "@/components/projects/project-detail-page";
import { MissingQueryRedirect } from "@/components/routes/query-route-states";

export function ProjectQueryRoute() {
  const projectId = useSearchParams().get("projectId")?.trim();

  return projectId ? <ProjectDetailPage projectId={projectId} /> : <MissingQueryRedirect href="/projects" />;
}
