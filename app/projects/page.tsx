import { AuthGate } from "@/components/auth/auth-gate";
import { ProjectsPage } from "@/components/projects/projects-page";

export default function ProjectsRoute() {
  return (
    <AuthGate>
      <ProjectsPage />
    </AuthGate>
  );
}
