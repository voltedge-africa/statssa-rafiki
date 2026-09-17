import { object, picklist, string } from "valibot";
import { createSubjects } from "@openauthjs/openauth/subject";
import { ROLES } from "./roles.ts";

export const subjects = createSubjects({
  user: object({
    id: string(),
    role: picklist(ROLES),
  }),
});
