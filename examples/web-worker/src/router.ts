import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create({
  allowOutsideOfServer: true,
});

const router = t.router;
const publicProcedure = t.procedure;

const appRouter = router({
  greeting: publicProcedure.input(z.object({ name: z.string() })).query(opts => {
    const { input } = opts;
    return `Hello ${input.name}` as const;
  }),
});

export { appRouter };

export type AppRouter = typeof appRouter;
