import { AuthGate } from "@/components/auth/auth-gate";
import { ProjectShareSettingsPage } from "@/components/share/project-share-settings-page";

type ProjectShareRouteProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectShareRoute({ params }: ProjectShareRouteProps) {
  const { projectId } = await params;

  return (
    <AuthGate>
      <ProjectShareSettingsPage projectId={projectId} />
    </AuthGate>
  );
}
