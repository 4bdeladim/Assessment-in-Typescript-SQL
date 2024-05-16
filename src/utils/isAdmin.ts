import { eq } from "drizzle-orm";
import db, { schema } from "../db/client";

export async function isAdmin(userId: number): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  return user?.isAdmin || false; // Ensuring the return type is Boolean
}
