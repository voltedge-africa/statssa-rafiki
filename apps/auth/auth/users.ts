import { eq } from "drizzle-orm";
import { db } from "./db/index.ts";
import { users } from "./db/schema.ts";
import { DEFAULT_ROLE, type Role } from "./roles.ts";

// The "db" the issuer pulls a user's role from by email. Backed by Postgres via Drizzle.
export interface User {
  id: string;
  email: string;
  role: Role;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function userId(email: string) {
  return `user_${normalizeEmail(email)}`;
}

export async function getUser(email: string): Promise<User> {
  const normalized = normalizeEmail(email);
  const [row] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (row) return { id: row.id, email: row.email, role: row.role };
  return { id: userId(normalized), email: normalized, role: DEFAULT_ROLE };
}

export async function setRole(email: string, role: Role): Promise<User> {
  const normalized = normalizeEmail(email);
  const [row] = await db
    .insert(users)
    .values({ id: userId(normalized), email: normalized, role })
    .onConflictDoUpdate({
      target: users.email,
      set: { role, updatedAt: new Date() },
    })
    .returning();
  return { id: row.id, email: row.email, role: row.role };
}
