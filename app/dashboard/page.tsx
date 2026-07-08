import { AuthGate } from "@/components/auth/auth-gate";
import { VisualDashboardShell } from "@/components/dashboard/visual-dashboard-shell";

export default function DashboardPage() {
  return (
    <AuthGate>
      <VisualDashboardShell />
    </AuthGate>
  );
}
