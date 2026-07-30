import { api } from "./api";
import { getAccessToken } from "./auth";

export interface RoleAccess {
  fullAccess: boolean;
  hasTenantAdmin: boolean;
  hasAppUser: boolean;
  tenantId: string | null;
  matchedRoles: string[];
}

export async function fetchRoleAccess(): Promise<RoleAccess> {
  const token = getAccessToken();
  if (!token) {
    return {
      fullAccess: false,
      hasTenantAdmin: false,
      hasAppUser: false,
      tenantId: null,
      matchedRoles: [],
    };
  }

  const response = await api.get<RoleAccess>("/auth/roles", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}
