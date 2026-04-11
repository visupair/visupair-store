/// <reference path="../.astro/types.d.ts" />

interface VisupairConsentGlobal {
  essential: true;
  marketing: boolean;
  personalization: boolean;
  analytics: boolean;
  updatedAt: number;
}

interface Window {
  __VISUPAIR_CONSENT__?: VisupairConsentGlobal;
}

declare namespace App {
  // Note: 'import {} from ""' syntax does not work in .d.ts files.
  interface Locals {
    user: import("better-auth").User | null;
    session: import("better-auth").Session | null;
    currency?: 'EUR' | 'PLN'; // Detected currency from Cloudflare/Vercel headers
    runtime: {
      env: {
        visupair_store: D1Database;
        BETTER_AUTH_SECRET: string;
        BETTER_AUTH_URL: string;
        POLAR_ACCESS_TOKEN: string;
        POLAR_WEBHOOK_SECRET: string;
        RESEND_API_KEY: string;
        VISUPAIR_KV: KVNamespace;
        VISUPAIR_R2: R2Bucket;
      };
    };
  }
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<any[]>;
  exec(query: string): Promise<D1ExecResult>;
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  first(column?: string): Promise<any>;
  all(): Promise<D1Result>;
  run(): Promise<D1Result>;
}

interface D1Result {
  success: boolean;
  results: any[];
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
    served_by: string;
    internal_stats: string;
  };
}

interface D1ExecResult {
  results: D1Result[];
  success: boolean;
}

declare namespace JSX {
  interface SVGAttributes<T> {
    "stroke-width"?: string | number;
    "stroke-linecap"?: "butt" | "round" | "square";
    "stroke-linejoin"?: "arcs" | "bevel" | "miter" | "miter-clip" | "round";
  }
}
