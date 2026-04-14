/**
 * Resolve the authenticated user for an Astro **page** (not API route).
 *
 * Priority:
 *   1. `Astro.locals.user` / `Astro.locals.session` — set by the middleware
 *      with zero extra HTTP calls.
 *   2. Direct server-side auth check via D1 + Better Auth (same logic as the
 *      middleware, retried once so a transient middleware failure doesn't lock
 *      the user out).
 *
 * Avoids the previous approach of `fetch(Astro.url.origin + "/api/auth/...")`,
 * which is a Worker self-fetch and unreliable on Cloudflare Workers.
 */

import type { AstroGlobal } from "astro";
import { mergeAuthEnv } from "./auth-worker-env";
import { createAuth } from "./auth";

export interface PageSessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PageSession {
  user: PageSessionUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
  };
}

async function getCloudflareEnv(): Promise<Record<string, unknown>> {
  // @ts-ignore — virtual module in the Workers bundle
  const { env } = await import("cloudflare:workers").catch(() => ({
    env: {} as Record<string, unknown>,
  }));
  return env ?? {};
}

/**
 * Returns the authenticated session for the current page request, or `null`
 * if the visitor is not signed in.
 */
export async function getPageSession(
  Astro: AstroGlobal,
): Promise<PageSession | null> {
  // 1. Fast path — middleware already resolved the session.
  if (Astro.locals.user?.id && Astro.locals.session) {
    return {
      user: Astro.locals.user as unknown as PageSessionUser,
      session: Astro.locals.session as unknown as PageSession["session"],
    };
  }

  // 2. Fallback — direct server-side check (same approach as middleware).
  try {
    const cfEnv = await getCloudflareEnv();
    let dbBinding = cfEnv.visupair_store as D1Database | undefined;

    if (!dbBinding) {
      try {
        const locals = Astro.locals as { runtime?: { env?: { visupair_store?: D1Database } } };
        dbBinding = locals.runtime?.env?.visupair_store;
      } catch { /* ignore */ }
    }

    if (!dbBinding) return null;

    const env = mergeAuthEnv(cfEnv as Record<string, unknown>);
    const auth = createAuth(dbBinding, env);
    const result = await auth.api.getSession({
      headers: Astro.request.headers,
    });

    if (result?.user?.id) {
      return {
        user: result.user as unknown as PageSessionUser,
        session: result.session as unknown as PageSession["session"],
      };
    }
  } catch (e) {
    console.error("[page-session] Fallback session check failed:", e);
  }

  return null;
}
