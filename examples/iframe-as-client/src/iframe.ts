import type { CreateTRPCProxyClient } from '@trpc/client';
import { createTRPCProxyClient } from '@trpc/client';
import { createMessagePortClient, messageChannelLink } from 'message-channel-trpc/client';
import type { AppRouter } from './router';

let port: MessagePort | null = null;
let client: CreateTRPCProxyClient<AppRouter> | null = null;

window.addEventListener('message', ev => {
  port = ev.ports[0];
  port.start();
  client = createTRPCProxyClient<AppRouter>({
    links: [
      messageChannelLink({
        client: createMessagePortClient({
          port,
        }),
      }),
    ],
  });
});

document.querySelector('form')!.addEventListener('submit', async e => {
  e.preventDefault();
  const result = await client?.greeting.query({
    name: (document.querySelector('input[name="name"]') as HTMLInputElement).value,
  });
  const p = document.querySelector('p');
  p && (p.innerHTML = result ?? '');
});
