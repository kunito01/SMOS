import { AuthGate } from "@/components/auth/auth-gate";
import { CompanyDetailPage } from "@/components/companies/company-detail-page";

type CompanyRouteProps = {
  params: Promise<{
    companyId: string;
  }>;
};

export default async function CompanyRoute({ params }: CompanyRouteProps) {
  const { companyId } = await params;

  return (
    <AuthGate>
      <CompanyDetailPage companyId={companyId} />
    </AuthGate>
  );
}
