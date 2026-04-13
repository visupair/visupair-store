/**
 * Single source for Better Auth `trustedOrigins` and Stripe checkout origin allowlists.
 * Keeps CSRF/origin checks aligned across auth and payment flows.
 */

function addOrigin(set: Set<string>, raw: string | undefined) {
  if (!raw?.trim()) return;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    set.add(u.origin);
  } catch {
    /* ignore invalid */
  }
}

/**
 * @param baseURL - Same seed as Better Auth `baseURL` (typically `BETTER_AUTH_URL` or dev default).
 */
export function buildTrustedOriginAllowlistSet(
  baseURL: string,
  env?: Record<string, string | undefined>,
): Set<string> {
  const set = new Set<string>();
  const devHosts = ["localhost", "127.0.0.1"];
  const devPorts = ["4321", "8787", "4173", "3000"];
  for (const host of devHosts) {
    for (const port of devPorts) {
      set.add(`http://${host}:${port}`);
    }
  }
  addOrigin(set, baseURL);
  addOrigin(set, env?.PUBLIC_SITE_URL);
  addOrigin(set, process.env.PUBLIC_SITE_URL);
  addOrigin(set, env?.BETTER_AUTH_URL);
  addOrigin(set, process.env.BETTER_AUTH_URL);
  const extra =
    env?.BETTER_AUTH_TRUSTED_ORIGINS || process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  if (extra) {
    for (const part of extra.split(",")) addOrigin(set, part.trim());
  }
  for (const o of [...set]) {
    try {
      const u = new URL(o);
      const host = u.hostname;
      if (host.startsWith("www.")) {
        set.add(`${u.protocol}//${host.replace(/^www\./, "")}`);
      } else if (
        host !== "localhost" &&
        !host.startsWith("127.") &&
        host.includes(".")
      ) {
        set.add(`${u.protocol}//www.${host}`);
      }
    } catch {
      /* */
    }
  }
  return set;
}

/** Better Auth expects `string[]`; same entries as the checkout `Set` allowlist. */
export function buildTrustedOriginsList(
  baseURL: string,
  env?: Record<string, string | undefined>,
): string[] {
  return [...buildTrustedOriginAllowlistSet(baseURL, env)].filter(Boolean);
}
