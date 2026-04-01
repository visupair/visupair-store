/** User-facing message when the same email is already registered for this course. */
export const COURSE_REGISTRATION_DUPLICATE_MESSAGE =
    "You are already registered for this course with this email address.";

type SanityFetch = (query: string, params?: Record<string, unknown>) => Promise<unknown>;

/**
 * True if a courseRegistration already exists for this course + email (case-insensitive email).
 */
export async function courseRegistrationExists(
    client: { fetch: SanityFetch },
    courseId: string,
    email: string,
): Promise<boolean> {
    const e = String(email || "")
        .trim()
        .toLowerCase();
    const cid = String(courseId || "").trim();
    if (!e || !cid) return false;

    const id = (await client.fetch(
        `*[_type == "courseRegistration" && lower(email) == $email && course._ref == $courseId][0]._id`,
        { email: e, courseId: cid },
    )) as string | null;

    return Boolean(id);
}
