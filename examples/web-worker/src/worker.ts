import { applyMessagePortHandler } from 'message-channel-trpc/server';
import { appRouter } from './router';

applyMessagePortHandler({ port: globalThis, router: appRouter });
