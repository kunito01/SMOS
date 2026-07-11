import { Suspense } from "react";
import { ProjectCostsQueryRoute } from "@/app/project-costs/project-costs-query-route";
import { AuthGate } from "@/components/auth/auth-gate";
import { QueryRouteFallback } from "@/components/routes/query-route-fallback";

export default function ProjectCostsPage() {
  return (
    <Suspense fallback={<QueryRouteFallback />}>
      <AuthGate>
        <ProjectCostsQueryRoute />
      </AuthGate>
    </Suspense>
  );
}
