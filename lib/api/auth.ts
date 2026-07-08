import { mockApi } from "@/lib/api/mock-client";
import { mockDatabase } from "@/lib/mock";
import type { User } from "@/lib/types";

export type AuthCredentials = {
  email: string;
  password: string;
};

export type RegisterPayload = AuthCredentials & {
  name: string;
};

export async function register(payload: RegisterPayload) {
  const user: User = {
    id: "user-registered-mock",
    name: payload.name,
    email: payload.email,
    avatar: "",
    createdAt: new Date().toISOString()
  };

  return mockApi({ user, token: "mock-register-token" });
}

export async function login(payload: AuthCredentials) {
  const fallbackUser = mockDatabase.users[0];
  const user = {
    ...fallbackUser,
    email: payload.email || fallbackUser.email,
    name: payload.email?.split("@")[0] || fallbackUser.name
  };

  return mockApi({ user, token: "mock-login-token" });
}

export async function logout() {
  return mockApi({ ok: true });
}

export async function handshake(userId: string) {
  return mockApi({
    ok: true,
    userId,
    serverTime: "2026-06-25T09:00:00.000Z"
  });
}

export async function getCurrentUser() {
  return mockApi(mockDatabase.users[0]);
}
