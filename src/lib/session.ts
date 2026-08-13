import "server-only";

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

/**
 * A minimal signed-cookie session, used while Supabase is switched off.
 *
 * Spotify tokens live in an httpOnly cookie, signed (not encrypted) with
 * SESSION_SECRET so the client can't forge one. httpOnly means JS on the page
 * can never read it, which preserves the "tokens never reach the browser" rule
 * from the PRD — the value travels through the browser but is only ever opened
 * server-side.
 *
 * This is a development-stage stand-in. When Supabase auth is turned on, the
 * tokens move to the `connections` table and this file goes away. Don't grow
 * features on top of it.
 */

const COOKIE_NAME = "sp_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type Session = {
  /** Spotify user id — doubles as our user id while Supabase is off. */
  userId: string;
  displayName: string | null;
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms. */
  expiresAt: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters. " +
        "Generate one with: openssl rand -base64 32",
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function serialize(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function deserialize(value: string): Session | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  // Constant-time compare; bail early if lengths differ since timingSafeEqual throws.
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return deserialize(raw);
}

export async function setSession(session: Session): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, serialize(session), {
    httpOnly: true,
    sameSite: "lax",
    // 127.0.0.1 is plain http in dev, so this can't be unconditionally true.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Short-lived cookie carrying the OAuth `state` value for CSRF protection. */
const STATE_COOKIE = "sp_oauth_state";

export async function setOAuthState(next: string): Promise<string> {
  const state = randomBytes(16).toString("base64url");
  const store = await cookies();
  store.set(STATE_COOKIE, `${state}:${next}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return state;
}

export async function consumeOAuthState(
  received: string,
): Promise<{ valid: boolean; next: string }> {
  const store = await cookies();
  const raw = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!raw) return { valid: false, next: "/" };

  const separator = raw.indexOf(":");
  const expected = separator === -1 ? raw : raw.slice(0, separator);
  const next = separator === -1 ? "/" : raw.slice(separator + 1);

  if (expected.length !== received.length) return { valid: false, next };
  const valid = timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(received),
  );

  return { valid, next };
}
