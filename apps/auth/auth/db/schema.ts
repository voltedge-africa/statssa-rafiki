import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { ROLES } from "@voltedge/auth-contract";

export const roleEnum = pgEnum("role", ROLES);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  role: roleEnum("role").notNull().default("Press"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
