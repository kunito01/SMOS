"use client";

import { useSearchParams } from "next/navigation";
import { GroupDetailPage } from "@/components/companies/group-detail-page";
import { MissingQueryRedirect } from "@/components/routes/query-route-states";

export function GroupQueryRoute() {
  const groupId = useSearchParams().get("groupId")?.trim();

  return groupId ? <GroupDetailPage groupId={groupId} /> : <MissingQueryRedirect href="/companies" />;
}
