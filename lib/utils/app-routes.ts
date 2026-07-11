const normalizeBasePath = (value: string | undefined) => {
  const trimmed = value?.trim();

  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};

export const appBasePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

const queryPath = (pathname: string, parameter: string, value: string) => {
  const routePath = appBasePath && pathname !== "/" ? `${pathname.replace(/\/$/, "")}/` : pathname;
  return `${routePath}?${parameter}=${encodeURIComponent(value)}`;
};

export const companyPath = (companyId: string) => queryPath("/company", "companyId", companyId);

export const projectPath = (projectId: string) => queryPath("/project", "projectId", projectId);

export const projectCostsPath = (projectId: string) =>
  queryPath("/project-costs", "projectId", projectId);

export const projectSharePath = (projectId: string) =>
  queryPath("/project-share", "projectId", projectId);

export const publicSharePath = (token: string) => queryPath("/share", "token", token);

export const appRoutes = {
  company: companyPath,
  project: projectPath,
  projectCosts: projectCostsPath,
  projectShare: projectSharePath,
  publicShare: publicSharePath
} as const;

export const withBasePath = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const scopedPath =
    appBasePath &&
    normalizedPath !== "/" &&
    !normalizedPath.endsWith("/") &&
    !normalizedPath.includes("?") &&
    !normalizedPath.includes("#")
      ? `${normalizedPath}/`
      : normalizedPath;

  if (
    !appBasePath ||
    scopedPath === appBasePath ||
    scopedPath.startsWith(`${appBasePath}/`) ||
    scopedPath.startsWith(`${appBasePath}?`) ||
    scopedPath.startsWith(`${appBasePath}#`)
  ) {
    return scopedPath;
  }

  return `${appBasePath}${scopedPath}`;
};
