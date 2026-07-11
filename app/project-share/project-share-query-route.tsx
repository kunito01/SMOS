"use client";

import { useSearchParams } from "next/navigation";
import { MissingQueryRedirect } from "@/components/routes/query-route-states";
import { ProjectShareSettingsPage } from "@/components/share/project-share-settings-page";

export function ProjectShareQueryRoute() {
  const projectId = useSearchParams().get("projectId")?.trim();

  return projectId ? (
    <ProjectShareSettingsPage projectId={projectId} />
  ) : (
    <MissingQueryRedirect href="/projects" />
  );
}
