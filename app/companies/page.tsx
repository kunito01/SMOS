import { AuthGate } from "@/components/auth/auth-gate";
import { CompaniesPage } from "@/components/companies/companies-page";

export default function CompaniesRoute() {
  return (
    <AuthGate>
      <CompaniesPage />
    </AuthGate>
  );
}
