import { Suspense } from "react";
import { ProjectShareQueryRoute } from "@/app/project-share/project-share-query-route";
import { AuthGate } from "@/components/auth/auth-gate";
import { QueryRouteFallback } from "@/components/routes/query-route-fallback";

export default function ProjectSharePage() {
  return (
    <Suspense fallback={<QueryRouteFallback />}>
      <AuthGate>
        <ProjectShareQueryRoute />
      </AuthGate>
    </Suspense>
  );
}
