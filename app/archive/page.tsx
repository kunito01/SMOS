import { ArchivePage } from "@/components/archive/archive-page";
import { AuthGate } from "@/components/auth/auth-gate";

export default function ArchiveRoute() {
  return (
    <AuthGate>
      <ArchivePage />
    </AuthGate>
  );
}
