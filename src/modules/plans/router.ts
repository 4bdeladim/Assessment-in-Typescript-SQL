import {
  router,
  adminProcedure,
  protectedProcedure,
  trpcError,
} from "./../../trpc/core";
import { z } from "zod";
import db, { schema } from "../../db/client";
import { eq } from "drizzle-orm";

const planSchema = z.object({
  name: z.string(),
  price: z.number(),
});

export const plans = router({
  create: adminProcedure.input(planSchema).mutation(async ({ input }) => {
    const { name, price } = input;
    const newPlan = await db.insert(schema.plans).values({ name, price });
    return newPlan;
  }),
  update: adminProcedure
    .input(planSchema.extend({ id: z.number() }))
    .mutation(async ({ input }) => {
      const { id, name, price } = input;
      const existingPlan = await db.query.plans.findFirst({
        where: eq(schema.plans.id, id),
      });
      if (!existingPlan) {
        throw new trpcError({
          code: "NOT_FOUND",
          message: "Plan not found",
        });
      }
      const updatedPlan = db
        .update(schema.plans)
        .set({ name, price })
        .where(eq(schema.plans.id, id));
      return updatedPlan;
    }),
  read: protectedProcedure.input(z.number()).query(async ({ input }) => {
    const plan = await db.query.plans.findFirst({
      where: eq(schema.plans.id, input),
    });
    if (!plan) {
      throw new trpcError({
        code: "NOT_FOUND",
        message: "Plan not found",
      });
    }
    return plan;
  }),
  proratedUpgradePrice: protectedProcedure
    .input(
      z.object({
        currentPlanId: z.number(),
        newPlanId: z.number(),
        daysRemaining: z.number(),
      })
    )
    .query(async ({ input }) => {
      const { currentPlanId, newPlanId, daysRemaining } = input;
      if (daysRemaining < 0) {
        throw new trpcError({
          code: "BAD_REQUEST",
          message: "Remaining days should not be negative",
        });
      }
      const [currentPlan, newPlan] = await Promise.all([
        db.query.plans.findFirst({ where: eq(schema.plans.id, currentPlanId) }),
        db.query.plans.findFirst({ where: eq(schema.plans.id, newPlanId) }),
      ]);
      if (!currentPlan || !newPlan) {
        throw new trpcError({
          code: "BAD_REQUEST",
          message: "Invalid plan IDs",
        });
      }
      if (newPlan.price <= currentPlan.price) {
        throw new trpcError({
          code: "BAD_REQUEST",
          message:
            "New plan price must be greater than current plan price for an upgrade",
        });
      }
      const dailyRate = (newPlan.price - currentPlan.price) / 30;
      const proratedPrice = dailyRate * daysRemaining;
      return { proratedPrice };
    }),
});
