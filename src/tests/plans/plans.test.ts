import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../../db/client";
import { createAuthenticatedCaller, createCaller } from "../helpers/utils";
import resetDb from "../helpers/resetDb";
import { eq } from "drizzle-orm";
import { trpcError } from "../../trpc/core";

describe("plans routes", async () => {
  let adminCaller: ReturnType<typeof createAuthenticatedCaller>;
  let userCaller: ReturnType<typeof createAuthenticatedCaller>;
  let basicPlan: { id: number; name: string; price: number };
  let premiumPlan: { id: number; name: string; price: number };

  beforeAll(async () => {
    await resetDb();

    // Create admin user
    const adminUser = {
      email: "admin@mail.com",
      password: "AdminPass123!",
      name: "Admin User",
      timezone: "Asia/Riyadh",
      locale: "en",
    };
    await createCaller({}).auth.register(adminUser);

    // Mark user as admin
    await db
      .update(schema.users)
      .set({ isAdmin: true })
      .where(eq(schema.users.email, adminUser.email));

    // Create regular user
    const regularUser = {
      email: "user@mail.com",
      password: "UserPass123!",
      name: "Regular User",
      timezone: "Asia/Riyadh",
      locale: "en",
    };
    await createCaller({}).auth.register(regularUser);

    const userInDb = await db.query.users.findFirst({
      where: eq(schema.users.email, regularUser.email),
    });

    const adminInDb = await db.query.users.findFirst({
      where: eq(schema.users.email, adminUser.email),
    });

    adminCaller = createAuthenticatedCaller({ userId: adminInDb!.id });
    userCaller = createAuthenticatedCaller({ userId: userInDb!.id });

    // Create plans
    await adminCaller.plans.create({
      name: "Basic",
      price: 100,
    });
    await adminCaller.plans.create({
      name: "Premium",
      price: 300,
    });

    // Fetch plans from DB to get their IDs
    basicPlan = (await db.query.plans.findFirst({
      where: eq(schema.plans.name, "Basic"),
    }))!;
    premiumPlan = (await db.query.plans.findFirst({
      where: eq(schema.plans.name, "Premium"),
    }))!;

    // Ensure plans are defined
    if (!basicPlan || !premiumPlan) {
      throw new Error("Failed to create initial plans for testing.");
    }
  });

  describe("create", async () => {
    const planData = {
      name: "Ultimate",
      price: 1000,
    };

    it("should create plan successfully as admin", async () => {
      const result = await adminCaller.plans.create(planData);
      expect(result).toBeDefined();

      const planInDb = await db.query.plans.findFirst({
        where: eq(schema.plans.name, planData.name),
      });
      expect(planInDb).toBeDefined();
      expect(planInDb!.name).toBe(planData.name);
      expect(planInDb!.price).toBe(planData.price);
    });

    it("should not allow non-admin to create plan", async () => {
      await expect(userCaller.plans.create(planData)).rejects.toThrowError(
        new trpcError({
          code: "UNAUTHORIZED",
        })
      );
    });
  });

  describe("update", async () => {
    it("should update plan successfully as admin", async () => {
      const updatedPlanData = {
        id: basicPlan.id,
        name: "Standard",
        price: 150,
      };
      const result = await adminCaller.plans.update(updatedPlanData);
      expect(result).toBeDefined();

      const planInDb = await db.query.plans.findFirst({
        where: eq(schema.plans.id, updatedPlanData.id),
      });
      expect(planInDb).toBeDefined();
      expect(planInDb!.name).toBe(updatedPlanData.name);
      expect(planInDb!.price).toBe(updatedPlanData.price);
    });

    it("should not allow non-admin to update plan", async () => {
      const updatedPlanData = {
        id: basicPlan.id,
        name: "Standard",
        price: 500,
      };
      await expect(
        userCaller.plans.update(updatedPlanData)
      ).rejects.toThrowError(
        new trpcError({
          code: "UNAUTHORIZED",
        })
      );
    });

    it("should throw error for non-existent plan", async () => {
      const invalidPlanData = { id: 999, name: "NonExistent", price: 0 };
      await expect(
        adminCaller.plans.update(invalidPlanData)
      ).rejects.toThrowError(
        new trpcError({
          code: "NOT_FOUND",
          message: "Plan not found",
        })
      );
    });
  });

  describe("read", async () => {
    it("should read plan successfully", async () => {
      const planId = basicPlan.id;
      const plan = await adminCaller.plans.read(planId);
      expect(plan).toBeDefined();
      expect(plan).toHaveProperty("name");
      expect(plan).toHaveProperty("price");
    });

    it("should throw error if plan not found", async () => {
      const nonExistentPlanId = 999;
      await expect(
        adminCaller.plans.read(nonExistentPlanId)
      ).rejects.toThrowError(
        new trpcError({
          code: "NOT_FOUND",
          message: "Plan not found",
        })
      );
    });
  });

  describe("proratedUpgradePrice", async () => {
    it("should calculate prorated upgrade price correctly", async () => {
      const input = {
        currentPlanId: basicPlan.id,
        newPlanId: premiumPlan.id,
        daysRemaining: 15,
      };
      const result = await adminCaller.plans.proratedUpgradePrice(input);
      expect(result).toBeDefined();
      expect(result).toHaveProperty("proratedPrice");
      expect(result.proratedPrice).toBeGreaterThan(0);
    });

    it("should throw error for invalid plan IDs", async () => {
      const invalidInput = {
        currentPlanId: 999,
        newPlanId: 1000,
        daysRemaining: 15,
      };
      await expect(
        adminCaller.plans.proratedUpgradePrice(invalidInput)
      ).rejects.toThrowError(
        new trpcError({
          code: "BAD_REQUEST",
          message: "Invalid plan IDs",
        })
      );
    });

    it("should throw error for negative days remaining", async () => {
      const invalidInput = {
        currentPlanId: basicPlan.id,
        newPlanId: premiumPlan.id,
        daysRemaining: -5,
      };
      await expect(
        adminCaller.plans.proratedUpgradePrice(invalidInput)
      ).rejects.toThrowError(
        new trpcError({
          code: "BAD_REQUEST",
          message: "Remaining days should not be negative",
        })
      );
    });
  });
});
