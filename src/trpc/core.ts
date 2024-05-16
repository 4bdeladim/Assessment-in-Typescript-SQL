import { initTRPC, TRPCError } from "@trpc/server";
import type { createContext } from "./context";
import { clearTokens, verifyAccessToken } from "../modules/auth/model";
import { isAdmin } from "../utils/isAdmin";
const t = initTRPC.context<typeof createContext>().create();

export const middleware = t.middleware;
export const router = t.router;
export const publicProcedure = t.procedure;
export const trpcError = TRPCError;
export const createCallerFactory = t.createCallerFactory;

// user procedure
const isUser = middleware(({ ctx: { req, res }, next }) => {
  try {
    const { userId } = verifyAccessToken({ req });
    return next({
      ctx: {
        user: { userId },
      },
    });
  } catch (error) {
    clearTokens({ res });
    throw new trpcError({
      code: "UNAUTHORIZED",
    });
  }
});
export const protectedProcedure = publicProcedure.use(isUser);

//admin procedure
const isAdminMiddleware = middleware(async ({ ctx: { req }, next }) => {
  try {
    const { userId } = verifyAccessToken({ req });
    const adminCheck = await isAdmin(userId);
    if (!adminCheck) {
      throw new trpcError({
        code: "UNAUTHORIZED",
        message: "Admins only",
      });
    }
    return next({
      ctx: {
        user: { userId },
      },
    });
  } catch (error) {
    throw new trpcError({
      code: "UNAUTHORIZED",
    });
  }
});

export const adminProcedure = publicProcedure.use(isAdminMiddleware);
