/** OAuth profile image (e.g. Google avatar URL). Email/password users usually omit this. */
export function getUserProfilePhotoUrl(image: unknown): string | null {
  if (typeof image !== "string") return null;
  const t = image.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}
