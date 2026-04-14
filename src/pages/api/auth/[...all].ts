import type { APIRoute } from "astro";
import { mergeAuthEnv } from "~/lib/auth-worker-env";
import { createAuth } from "~/lib/auth";
import {
  assertEmailChangeAllowed,
  assertPasswordChangeAllowed,
  recordEmailChangeSuccess,
  recordPasswordChangeSuccess,
} from "~/lib/user-security-change-quota";

/**
 * Better Auth API route handler
 * Handles all authentication endpoints: /api/auth/*
 */
export const ALL: APIRoute = async ({ request, locals }) => {
  try {
    // Get D1 database binding from Cloudflare runtime
    // @ts-ignore - 'cloudflare:workers' may not be fully typed without specific environment setup
    const { env: cfEnv } = await import("cloudflare:workers").catch(() => ({ env: {} }));

    // Fallback: If cfEnv is empty/undefined, fall back to process.env or similar for dev if needed
    // Note: Astro v6 removes locals.runtime.env and throws an error if accessed directly
    let dbBinding = cfEnv?.visupair_store;
    let runtimeEnv = cfEnv || {};

    // Try catching locals.runtime.env just in case it's not v6 yet or a different adapter
    try {
      if (!dbBinding && locals.runtime && typeof locals.runtime === 'object') {
        // Use Object.getOwnPropertyDescriptor to avoid triggering the getter that throws the error
        const descriptor = Object.getOwnPropertyDescriptor(locals.runtime, 'env');
        if (descriptor && typeof descriptor.get !== 'function') {
          dbBinding = (locals.runtime as any).env?.visupair_store;
          runtimeEnv = (locals.runtime as any).env || {};
        }
      }
    } catch (e) { }

    if (!dbBinding) {
      console.error("❌ D1 Database binding 'visupair_store' not found");
      return new Response(
        JSON.stringify({
          error: "Database not configured",
          message: "D1 database binding 'visupair_store' is missing. Check wrangler.toml and astro.config.mjs"
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const env = mergeAuthEnv(runtimeEnv as Record<string, unknown>);

    let auth: ReturnType<typeof createAuth>;
    try {
      auth = createAuth(dbBinding, env);
    } catch (configErr) {
      const message =
        configErr instanceof Error
          ? configErr.message
          : "Auth configuration failed";
      console.error("[AUTH] createAuth failed:", configErr);
      return new Response(
        JSON.stringify({
          error: "Auth configuration error",
          message,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const reqUrl = new URL(request.url);
    const pathname = reqUrl.pathname;
    let quotaUserId: string | null = null;

    if (request.method === "POST") {
      if (pathname.endsWith("/change-email") || pathname.endsWith("/change-password")) {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (session?.user?.id) {
            quotaUserId = session.user.id;
            if (pathname.endsWith("/change-email")) {
              const gate = await assertEmailChangeAllowed(dbBinding, quotaUserId);
              if (!gate.ok) {
                return new Response(JSON.stringify({ message: gate.message }), {
                  status: 422,
                  headers: { "Content-Type": "application/json" },
                });
              }
            } else {
              const gate = await assertPasswordChangeAllowed(dbBinding, quotaUserId);
              if (!gate.ok) {
                return new Response(JSON.stringify({ message: gate.message }), {
                  status: 422,
                  headers: { "Content-Type": "application/json" },
                });
              }
            }
          }
        } catch (e) {
          /* Quota table missing, getSession hiccup, etc. — do not block auth */
          console.error("[AUTH] Pre-handler quota/session check failed:", e);
          quotaUserId = null;
        }
      }
    }

    let response: Response;
    try {
      response = await auth.handler(request);
    } catch (handlerErr) {
      console.error("[AUTH] auth.handler threw:", handlerErr);
      const message =
        handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
      return new Response(
        JSON.stringify({ error: "Auth request failed", message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (response.status >= 500) {
      const bodyText = await response.clone().text();
      if (!bodyText.trim()) {
        const baseURL = env.BETTER_AUTH_URL || "(not set)";
        const hasGoogle = Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
        const diag = [
          `BETTER_AUTH_URL=${baseURL}`,
          `hasGoogle=${hasGoogle}`,
          `path=${pathname}`,
        ].join(", ");
        console.error(`[AUTH] Empty 500 body — ${diag}`);
        return new Response(
          JSON.stringify({
            error: "Internal server error",
            message: `Auth handler returned empty 500. Diagnostics: ${diag}`,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (response.ok && request.method === "POST") {
      const isEmail = pathname.endsWith("/change-email");
      const isPassword = pathname.endsWith("/change-password");
      if (isEmail || isPassword) {
        let uid = quotaUserId;
        if (!uid && isPassword) {
          try {
            const body = (await response.clone().json()) as { user?: { id?: string } };
            if (body?.user?.id) uid = body.user.id;
          } catch {
            /* non-JSON success */
          }
        }
        if (uid) {
          try {
            if (isEmail) await recordEmailChangeSuccess(dbBinding, uid);
            else await recordPasswordChangeSuccess(dbBinding, uid);
          } catch (e) {
            console.error("[AUTH] Failed to record security change quota:", e);
          }
        }
      }
    }

    if (request.method === "POST") {
      const path = new URL(request.url).pathname;
      if (
        path.includes("sign-in") ||
        path.includes("sign-up") ||
        path.endsWith("/change-password")
      ) {
        console.log(`[AUTH] ${request.method} ${path} → ${response.status}`);
      }
    }

    return response;
  } catch (error) {
    console.error("❌ Auth handler error:", error);
    const message =
      error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
