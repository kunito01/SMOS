"use client";

import { useSearchParams } from "next/navigation";
import { MissingPublicShareToken } from "@/components/routes/query-route-states";
import { PublicSharePage } from "@/components/share/public-share-page";

export function ShareQueryRoute() {
  const token = useSearchParams().get("token")?.trim();

  return token ? <PublicSharePage token={token} /> : <MissingPublicShareToken />;
}
