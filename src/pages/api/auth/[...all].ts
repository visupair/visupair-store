import type { APIRoute } from "astro";
import { createAuth } from "~/lib/auth";

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

    // Merge runtime env with build-time env (import.meta.env) to ensure we have everything
    const env = {
      ...import.meta.env,
      ...runtimeEnv
    };

    // Create auth instance with D1 binding and environment variables
    const auth = createAuth(dbBinding, env);

    // Handle the request — auth.handler() only takes a Request.
    // Env is already captured inside the auth instance via createAuth().
    const response = await auth.handler(request);

    if (request.method === "POST") {
      const path = new URL(request.url).pathname;
      if (path.includes("sign-in") || path.includes("sign-up")) {
        console.log(`[AUTH] ${request.method} ${path} → ${response.status}`);
      }
    }

    return response;
  } catch (error) {
    console.error("❌ Auth handler error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
