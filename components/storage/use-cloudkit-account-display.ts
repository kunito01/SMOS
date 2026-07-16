"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getCloudKitAccountDisplay,
  getCloudKitAccountTag,
  type CloudKitUserIdentity
} from "@/lib/storage/cloudkit/cloudkit-client";

export function useCloudKitAccountDisplay(identity: CloudKitUserIdentity | null) {
  const account = useMemo(
    () => (identity ? getCloudKitAccountDisplay(identity) : null),
    [identity]
  );
  const [accountTag, setAccountTag] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setAccountTag(null);

    if (!identity) {
      return () => {
        active = false;
      };
    }

    void getCloudKitAccountTag(identity)
      .then((tag) => {
        if (active) {
          setAccountTag(tag);
        }
      })
      .catch(() => {
        if (active) {
          setAccountTag(null);
        }
      });

    return () => {
      active = false;
    };
  }, [identity]);

  return { account, accountTag };
}
