import { Router } from "express";
import { config } from "../config.js";

export const authRouter = Router();

function hasAnyRole(tags: string[], candidates: string[]): boolean {
  return candidates.some((role) => tags.includes(role));
}

function roleCandidates(tenantId: string, role: "tenant-admin" | "app-user"): string[] {
  return [
    `roles:id:${tenantId}-${role}`,
    `roles:id:${role}`,
  ];
}

authRouter.get("/context", (_req, res) => {
  const loginUrl = config.dataos.dataosOrigin || undefined;
  res.json({
    tenantId: config.dataos.tenantId || null,
    dataosEnv: config.dataos.dataosOrigin || null,
    loginUrl,
  });
});

authRouter.get("/roles", async (req, res, next) => {
  try {
    const authHeader = req.header("authorization")?.trim() ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({ error: "Missing or invalid bearer token." });
    }
    if (!config.dataos.dataosOrigin || !config.dataos.tenantId) {
      return res.status(500).json({
        error: "Unable to resolve DataOS environment from SEMANTIC_API_URL.",
      });
    }

    const target = new URL("/platform/home/api/v1/fetchPlatformAtoms", config.dataos.dataosOrigin);
    target.searchParams.set("tenantId", config.dataos.tenantId);

    const upstream = await fetch(target.toString(), {
      method: "GET",
      headers: {
        authorization: authHeader,
        "content-type": "application/json",
      },
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return res.status(upstream.status).json({
        error: "Failed to fetch DataOS role tags.",
        details: body || upstream.statusText,
      });
    }

    const payload = (await upstream.json()) as { tags?: unknown };
    const tags = Array.isArray(payload?.tags) ? payload.tags.filter((t): t is string => typeof t === "string") : [];
    const tenantAdminCandidates = roleCandidates(config.dataos.tenantId, "tenant-admin");
    const appUserCandidates = roleCandidates(config.dataos.tenantId, "app-user");
    const hasTenantAdmin = hasAnyRole(tags, tenantAdminCandidates);
    const hasAppUser = hasAnyRole(tags, appUserCandidates);
    const allowedSet = new Set([...tenantAdminCandidates, ...appUserCandidates]);

    return res.json({
      tenantId: config.dataos.tenantId,
      fullAccess: hasTenantAdmin || hasAppUser,
      hasTenantAdmin,
      hasAppUser,
      matchedRoles: tags.filter((tag) => allowedSet.has(tag)),
    });
  } catch (err) {
    next(err);
  }
});
