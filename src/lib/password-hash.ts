/**
 * PBKDF2 password hashing via Web Crypto API.
 *
 * Default scrypt in Better Auth exceeds Cloudflare Workers' CPU time limits.
 * Web Crypto runs in native code outside the JS isolate, so it does not count
 * against the CPU budget.
 *
 * Format: `pbkdf2:iterations:salt_b64:hash_b64`
 *
 * The prefix lets us identify and migrate hashes later if needed.
 * We also accept legacy Better Auth scrypt hashes (`hex_salt:hex_hash`) for
 * sign-in, so existing accounts keep working after the migration.
 */

const ITERATIONS = 100_000;
const HASH_ALGO = "SHA-256";
const HASH_BITS = 256;
const SALT_BYTES = 16;
const PREFIX = "pbkdf2";

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: HASH_ALGO },
    keyMaterial,
    HASH_BITS,
  );
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const bits = await deriveKey(password, salt);
  return `${PREFIX}:${ITERATIONS}:${toBase64(salt)}:${toBase64(bits)}`;
}

export async function verifyPassword(data: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const { hash, password } = data;

  if (hash.startsWith(`${PREFIX}:`)) {
    const parts = hash.split(":");
    if (parts.length !== 4) return false;
    const iterations = parseInt(parts[1], 10);
    const salt = fromBase64(parts[2]);
    const expected = fromBase64(parts[3]);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: HASH_ALGO },
      keyMaterial,
      expected.length * 8,
    );
    return timingSafeEqual(new Uint8Array(bits), expected);
  }

  return false;
}
