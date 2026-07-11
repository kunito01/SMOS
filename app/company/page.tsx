import { Suspense } from "react";
import { CompanyQueryRoute } from "@/app/company/company-query-route";
import { AuthGate } from "@/components/auth/auth-gate";
import { QueryRouteFallback } from "@/components/routes/query-route-fallback";

export default function CompanyPage() {
  return (
    <Suspense fallback={<QueryRouteFallback />}>
      <AuthGate>
        <CompanyQueryRoute />
      </AuthGate>
    </Suspense>
  );
}
