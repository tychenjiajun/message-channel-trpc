# message-channel-trpc

<p>
  <a href="https://www.npmjs.com/package/message-channel-trpc">
    <img alt="NPM" src="https://img.shields.io/npm/v/message-channel-trpc"/>
  </a>
  <a href="https://codecov.io/gh/tychenjiajun/message-channel-trpc"> 
  <img src="https://codecov.io/gh/tychenjiajun/message-channel-trpc/branch/main/graph/badge.svg?token=DU33O0D9LZ"/> 
  </a>
  <span>
    <img alt="MIT" src="https://img.shields.io/npm/l/message-channel-trpc"/>
  </span>
</p>

<p></p>

**Build IPC for MessageChannel with tRPC**

- Build fully type-safe IPC.
- Secure alternative to opening servers on localhost.
- Full support for queries, mutations, and subscriptions.

## Installation

```sh
# Using pnpm
pnpm add message-channel-trpc

# Using yarn
yarn add message-channel-trpc

# Using npm
npm install --save message-channel-trpc
```

## Basic Setup

1. Add your tRPC router to the MessageChannel main process using `createIPCHandler`:

   ```ts
   import { app } from 'electron';
   import { createIPCHandler } from 'message-channel-trpc/server';
   import { router } from './api';

   app.on('ready', () => {
     const win = new BrowserWindow({
       webPreferences: {
         // Replace this path with the path to your preload file (see next step)
         preload: 'path/to/preload.js',
       },
     });

     createIPCHandler({ router, windows: [win] });
   });
   ```

2. Expose the IPC to the render process from the [preload file](https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts):

   ```ts
   import { exposeMessageChannelTRPC } from 'message-channel-trpc/server';

   process.once('loaded', async () => {
     exposeMessageChannelTRPC();
   });
   ```

   > Note: `message-channel-trpc` depends on `contextIsolation` being enabled, which is the default.

3. When creating the client in the render process, use the `ipcLink` (instead of the HTTP or batch HTTP links):

   ```ts
   import { createTRPCProxyClient } from '@trpc/client';
   import { ipcLink } from 'message-channel-trpc/client';

   export const client = createTRPCProxyClient({
     links: [ipcLink()],
   });
   ```

4. Now you can use the client in your render process as you normally would (e.g. using `@trpc/react`).
