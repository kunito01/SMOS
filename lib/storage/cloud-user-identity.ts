/** Shared cloud identity shape used by Google Drive sync (and legacy backups). */
export type CloudUserIdentity = {
  userRecordName: string;
  nameComponents?: {
    givenName?: string;
    familyName?: string;
  };
  lookupInfo?: {
    userRecordName?: string;
    emailAddress?: string;
    phoneNumber?: string;
    [key: string]: unknown;
  };
};

/** @deprecated Use CloudUserIdentity */
export type CloudKitUserIdentity = CloudUserIdentity;
