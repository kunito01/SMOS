"use client";

import { useSearchParams } from "next/navigation";
import { CompanyDetailPage } from "@/components/companies/company-detail-page";
import { MissingQueryRedirect } from "@/components/routes/query-route-states";

export function CompanyQueryRoute() {
  const companyId = useSearchParams().get("companyId")?.trim();

  return companyId ? <CompanyDetailPage companyId={companyId} /> : <MissingQueryRedirect href="/companies" />;
}
