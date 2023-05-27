import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const router = t.router;
const publicProcedure = t.procedure;

const appRouter = router({
  greeting: publicProcedure.input(z.object({ name: z.string() })).query(opts => {
    const { input } = opts;

    return `Hello ${input.name}` as const;
  }),
});


export type AppRouter = typeof appRouter;
