import { AuthGate } from "@/components/auth/auth-gate";
import { WorkflowPage } from "@/components/workflow/workflow-page";

export default function WorkflowRoute() {
  return (
    <AuthGate>
      <WorkflowPage />
    </AuthGate>
  );
}
