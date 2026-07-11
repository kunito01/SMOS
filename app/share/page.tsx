import { Suspense } from "react";
import { ShareQueryRoute } from "@/app/share/share-query-route";
import { QueryRouteFallback } from "@/components/routes/query-route-fallback";

export default function SharePage() {
  return (
    <Suspense fallback={<QueryRouteFallback />}>
      <ShareQueryRoute />
    </Suspense>
  );
}
