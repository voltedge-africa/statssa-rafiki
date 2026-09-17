import { object, picklist, string } from "valibot";
import { createSubjects } from "@openauthjs/openauth/subject";

// Keep in sync with apps/auth/auth/subjects.ts. Both sides must agree on the shape of the
// access token payload for `client.verify` to accept tokens issued by the auth server.
export const subjects = createSubjects({
  user: object({
    id: string(),
    role: picklist(["Press", "Staff", "Admin"]),
  }),
});
