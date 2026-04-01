/** Shown when the course is closed or has reached max participants. */
export const COURSE_FULL_MESSAGE =
    "This course is full and is no longer accepting registrations.";

type SanityRW = {
    fetch: (query: string, params?: Record<string, unknown>) => Promise<unknown>;
    patch: (id: string) => {
        set: (doc: Record<string, unknown>) => { commit: () => Promise<unknown> };
    };
};

/**
 * Whether a new registration should be rejected (manually closed or at capacity).
 */
export async function assertCourseAcceptsRegistrations(
    client: Pick<SanityRW, "fetch">,
    courseId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
    const cid = String(courseId || "").trim();
    if (!cid) return { ok: false, message: "Invalid course." };

    const course = (await client.fetch(
        `*[_type == "course" && _id == $id][0]{ registrationOpen, maxParticipants }`,
        { id: cid },
    )) as { registrationOpen?: boolean; maxParticipants?: number | null } | null;

    if (!course) return { ok: false, message: "Course not found." };

    if (course.registrationOpen === false) {
        return { ok: false, message: COURSE_FULL_MESSAGE };
    }

    const max = course.maxParticipants;
    if (max == null || typeof max !== "number" || max <= 0) {
        return { ok: true };
    }

    const count = (await client.fetch(
        `count(*[_type == "courseRegistration" && course._ref == $courseId])`,
        { courseId: cid },
    )) as number;

    if (count >= max) {
        return { ok: false, message: COURSE_FULL_MESSAGE };
    }

    return { ok: true };
}

/**
 * After a successful registration, set registrationOpen to false if count >= maxParticipants.
 */
export async function maybeCloseCourseWhenFull(
    client: SanityRW,
    courseId: string,
): Promise<void> {
    const cid = String(courseId || "").trim();
    if (!cid) return;

    const course = (await client.fetch(
        `*[_type == "course" && _id == $id][0]{ registrationOpen, maxParticipants }`,
        { id: cid },
    )) as { registrationOpen?: boolean; maxParticipants?: number | null } | null;

    if (!course || course.registrationOpen === false) return;

    const max = course.maxParticipants;
    if (max == null || typeof max !== "number" || max <= 0) return;

    const count = (await client.fetch(
        `count(*[_type == "courseRegistration" && course._ref == $courseId])`,
        { courseId: cid },
    )) as number;

    if (count >= max) {
        await client.patch(cid).set({ registrationOpen: false }).commit();
    }
}
