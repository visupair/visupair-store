// Client-only auth code — browser operations only
// https://www.better-auth.com/docs/installation#create-client
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  // Better Auth docs: baseURL must be the server origin, NOT including basePath.
  // The client appends basePath ("/api/auth") automatically.
  baseURL: typeof window !== "undefined"
    ? window.location.origin
    : (import.meta.env.BETTER_AUTH_URL || "http://localhost:4321"),
});

export const { signIn, signUp, signOut, useSession } = authClient;
