import { Suspense } from "react";
import { ProjectQueryRoute } from "@/app/project/project-query-route";
import { AuthGate } from "@/components/auth/auth-gate";
import { QueryRouteFallback } from "@/components/routes/query-route-fallback";

export default function ProjectPage() {
  return (
    <Suspense fallback={<QueryRouteFallback />}>
      <AuthGate>
        <ProjectQueryRoute />
      </AuthGate>
    </Suspense>
  );
}
