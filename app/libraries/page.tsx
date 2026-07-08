import { AuthGate } from "@/components/auth/auth-gate";
import { LibrariesPage } from "@/components/libraries/libraries-page";

export default function Page() {
  return (
    <AuthGate>
      <LibrariesPage />
    </AuthGate>
  );
}
