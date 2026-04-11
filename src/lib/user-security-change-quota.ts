/** Max successful email-change initiations and password changes per user per calendar month (UTC). */
export const SECURITY_CHANGE_LIMIT_PER_MONTH = 2;

export type SecurityChangeQuotaSlice = {
  usedThisMonth: number;
  limit: number;
  remaining: number;
};

export type SecurityChangeQuota = {
  email: SecurityChangeQuotaSlice;
  password: SecurityChangeQuotaSlice;
};

function quotaMonthUtc(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${m < 10 ? `0${m}` : m}`;
}

function sliceFromRow(
  monthCol: string,
  countCol: number | null,
  currentMonth: string,
): SecurityChangeQuotaSlice {
  const usedThisMonth =
    monthCol === currentMonth ? Math.max(0, Number(countCol ?? 0)) : 0;
  const limit = SECURITY_CHANGE_LIMIT_PER_MONTH;
  const remaining = Math.max(0, limit - usedThisMonth);
  return { usedThisMonth, limit, remaining };
}

export async function getSecurityChangeQuota(
  db: D1Database,
  userId: string,
): Promise<SecurityChangeQuota> {
  const month = quotaMonthUtc();
  const row = await db
    .prepare(
      `SELECT emailChangeMonth, emailChangeCount, passwordChangeMonth, passwordChangeCount
       FROM user_security_change_quota WHERE userId = ?`,
    )
    .bind(userId)
    .first<{
      emailChangeMonth: string;
      emailChangeCount: number;
      passwordChangeMonth: string;
      passwordChangeCount: number;
    }>();

  if (!row) {
    const empty = { usedThisMonth: 0, limit: SECURITY_CHANGE_LIMIT_PER_MONTH, remaining: SECURITY_CHANGE_LIMIT_PER_MONTH };
    return { email: empty, password: { ...empty } };
  }

  return {
    email: sliceFromRow(row.emailChangeMonth, row.emailChangeCount, month),
    password: sliceFromRow(row.passwordChangeMonth, row.passwordChangeCount, month),
  };
}

export async function assertEmailChangeAllowed(
  db: D1Database,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const q = await getSecurityChangeQuota(db, userId);
  if (q.email.remaining <= 0) {
    return {
      ok: false,
      message:
        "You have reached the limit of email changes for this month. Try again next month or contact support if you need help.",
    };
  }
  return { ok: true };
}

export async function assertPasswordChangeAllowed(
  db: D1Database,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const q = await getSecurityChangeQuota(db, userId);
  if (q.password.remaining <= 0) {
    return {
      ok: false,
      message:
        "You have reached the limit of password changes for this month. Try again next month or contact support if you need help.",
    };
  }
  return { ok: true };
}

export async function recordEmailChangeSuccess(
  db: D1Database,
  userId: string,
): Promise<void> {
  const month = quotaMonthUtc();
  const row = await db
    .prepare(
      `SELECT emailChangeMonth, emailChangeCount FROM user_security_change_quota WHERE userId = ?`,
    )
    .bind(userId)
    .first<{ emailChangeMonth: string; emailChangeCount: number }>();

  if (!row) {
    await db
      .prepare(
        `INSERT INTO user_security_change_quota (userId, emailChangeMonth, emailChangeCount, passwordChangeMonth, passwordChangeCount)
         VALUES (?, ?, 1, '', 0)`,
      )
      .bind(userId, month)
      .run();
    return;
  }

  const same = row.emailChangeMonth === month;
  const next = same ? row.emailChangeCount + 1 : 1;
  await db
    .prepare(
      `UPDATE user_security_change_quota SET emailChangeMonth = ?, emailChangeCount = ? WHERE userId = ?`,
    )
    .bind(month, next, userId)
    .run();
}

export async function recordPasswordChangeSuccess(
  db: D1Database,
  userId: string,
): Promise<void> {
  const month = quotaMonthUtc();
  const row = await db
    .prepare(
      `SELECT passwordChangeMonth, passwordChangeCount FROM user_security_change_quota WHERE userId = ?`,
    )
    .bind(userId)
    .first<{ passwordChangeMonth: string; passwordChangeCount: number }>();

  if (!row) {
    await db
      .prepare(
        `INSERT INTO user_security_change_quota (userId, emailChangeMonth, emailChangeCount, passwordChangeMonth, passwordChangeCount)
         VALUES (?, '', 0, ?, 1)`,
      )
      .bind(userId, month)
      .run();
    return;
  }

  const same = row.passwordChangeMonth === month;
  const next = same ? row.passwordChangeCount + 1 : 1;
  await db
    .prepare(
      `UPDATE user_security_change_quota SET passwordChangeMonth = ?, passwordChangeCount = ? WHERE userId = ?`,
    )
    .bind(month, next, userId)
    .run();
}
