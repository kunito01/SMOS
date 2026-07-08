import { PublicSharePage } from "@/components/share/public-share-page";

type PublicShareRouteProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function PublicShareRoute({ params }: PublicShareRouteProps) {
  const { token } = await params;

  return <PublicSharePage token={token} />;
}
