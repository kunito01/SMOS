import { AuthGate } from "@/components/auth/auth-gate";
import { GroupDetailPage } from "@/components/companies/group-detail-page";

type GroupRouteProps = {
  params: Promise<{
    groupId: string;
  }>;
};

export default async function GroupRoute({ params }: GroupRouteProps) {
  const { groupId } = await params;

  return (
    <AuthGate>
      <GroupDetailPage groupId={groupId} />
    </AuthGate>
  );
}
