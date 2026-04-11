import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import { account } from "./auth-schema";

export type D1Client = Parameters<typeof drizzle>[0];

/** Linked auth providers we surface in the UI (no “Better Auth” branding). */
export type ProfileSignInMethod = "google" | "visupair";

function coerceUserDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Locale-aware label for the `user.createdAt` from the session / DB. */
export function formatAccountCreatedAtDisplay(
  value: unknown,
  locale = "en-US",
): string {
  const d = coerceUserDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Reads linked OAuth / credential rows for this user (Better Auth `account` table).
 */
export async function getProfileSignInMethods(
  db: D1Client,
  userId: string,
): Promise<ProfileSignInMethod[]> {
  const dbORM = drizzle(db, { schema: { account } });
  const rows = await dbORM
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId));

  const set = new Set<ProfileSignInMethod>();
  for (const r of rows) {
    if (r.providerId === "google") set.add("google");
    else if (r.providerId === "credential") set.add("visupair");
  }

  const list = [...set];
  list.sort((a, b) => {
    if (a === b) return 0;
    return a === "visupair" ? -1 : 1;
  });
  return list;
}

/**
 * Better Auth `changePassword` requires a `credential` row with a non-null password hash.
 * Account linking can create a `credential` row before a password exists — UI must not
 * show “change password” until this is true.
 */
export async function userHasCredentialPassword(
  db: D1Client,
  userId: string,
): Promise<boolean> {
  const dbORM = drizzle(db, { schema: { account } });
  const row = await dbORM
    .select({ password: account.password })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential")),
    )
    .get();
  return Boolean(row?.password && String(row.password).length > 0);
}
