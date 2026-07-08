import { AuthGate } from "@/components/auth/auth-gate";
import { ProjectDetailPage } from "@/components/projects/project-detail-page";

type ProjectRouteProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectRoute({ params }: ProjectRouteProps) {
  const { projectId } = await params;

  return (
    <AuthGate>
      <ProjectDetailPage projectId={projectId} />
    </AuthGate>
  );
}
