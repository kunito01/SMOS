import { Suspense } from "react";
import { GroupQueryRoute } from "@/app/group/group-query-route";
import { AuthGate } from "@/components/auth/auth-gate";
import { QueryRouteFallback } from "@/components/routes/query-route-fallback";

export default function GroupPage() {
  return (
    <Suspense fallback={<QueryRouteFallback />}>
      <AuthGate>
        <GroupQueryRoute />
      </AuthGate>
    </Suspense>
  );
}
