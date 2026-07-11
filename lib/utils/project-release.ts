import type { Project, ProjectVersion } from "@/lib/types";

export type PublishedReleaseKind = "demo" | "official";

const releaseVersionId = (project: Project, kind: PublishedReleaseKind) => `${project.id}-version-${kind}`;

export const isPublishedVersion = (version?: ProjectVersion) =>
  Boolean(version?.status === "released" && version.versionNumber?.trim() && version.releaseDate?.trim());

export const findProjectReleaseVersion = (project: Project, kind: PublishedReleaseKind) =>
  project.versions.find((version) => version.kind === kind || version.id === releaseVersionId(project, kind));

export const getProjectPublishedReleaseKinds = (project: Project): PublishedReleaseKind[] => {
  const hasDemoRelease = isPublishedVersion(findProjectReleaseVersion(project, "demo"));
  const hasOfficialRelease = isPublishedVersion(findProjectReleaseVersion(project, "official"));

  return [
    ...(hasDemoRelease ? (["demo"] as const) : []),
    ...(hasOfficialRelease ? (["official"] as const) : [])
  ];
};

export const hasProjectPublishedRelease = (project: Project) =>
  getProjectPublishedReleaseKinds(project).length > 0;
