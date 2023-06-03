import { messageChannelLink, createMessagePortClient } from 'message-channel-trpc/client';
import type { AppRouter } from './router';
import { createTRPCProxyClient } from '@trpc/client';

const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
});

const client = createTRPCProxyClient<AppRouter>({
  links: [
    messageChannelLink({
      client: createMessagePortClient({
        port: worker,
      }),
    }),
  ],
});

document.querySelector('button')?.addEventListener('click', async () => {
  const result = await client.greeting.query({ name: 'world' });
  const paragraph = document.querySelector('p');
  paragraph && (paragraph.innerText = JSON.stringify(result));
});
