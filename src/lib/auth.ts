import "server-only";

import { getSession, type Session } from "@/lib/session";

/**
 * The signed-in user, or null.
 *
 * While Supabase is switched off this reads the signed session cookie. When
 * Supabase auth is turned on, this is the one function that changes — callers
 * only ever see `{ id, displayName }`.
 */
export async function getUser(): Promise<{
  id: string;
  displayName: string | null;
} | null> {
  const session: Session | null = await getSession();
  if (!session) return null;
  return { id: session.userId, displayName: session.displayName };
}

/** Throws a 401-shaped error if there is no session. For use in Route Handlers. */
export async function requireUser() {
  const user = await getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}
