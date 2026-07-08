import { AuthGate } from "@/components/auth/auth-gate";
import { ProjectCostsPage } from "@/components/costs/project-costs-page";

type ProjectCostsRouteProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectCostsRoute({ params }: ProjectCostsRouteProps) {
  const { projectId } = await params;

  return (
    <AuthGate>
      <ProjectCostsPage projectId={projectId} />
    </AuthGate>
  );
}
