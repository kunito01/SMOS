import { AuthGate } from "@/components/auth/auth-gate";
import { GlobalCostsPage } from "@/components/costs/global-costs-page";

export default function CostsRoute() {
  return (
    <AuthGate>
      <GlobalCostsPage />
    </AuthGate>
  );
}
