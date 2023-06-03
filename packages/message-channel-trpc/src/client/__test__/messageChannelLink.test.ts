import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTRPCProxyClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { TRPCResponseMessage } from '@trpc/server/rpc';
import z from 'zod';
import { createMessagePortClient, messageChannelLink } from '../messageChannelLink';
import { MessagePort } from '../../type';

const t = initTRPC.create();
const router = t.router({
  testQuery: t.procedure.query(() => 'query success'),
  testMutation: t.procedure.input(z.string()).mutation(() => 'mutation success'),
  testSubscription: t.procedure.subscription(() => {
    return {
      next: () => {},
      complete: () => {},
    };
  }),
  testInputs: t.procedure
    .input(z.object({ str: z.string(), date: z.date(), bigint: z.bigint() }))
    .query(input => {
      return input;
    }),
});

type Router = typeof router;

const port: MessagePort = {} as any;
let handlers: ((message: TRPCResponseMessage) => void)[] = [];
beforeEach(() => {
  handlers = [];
  port.postMessage = vi.fn();
  port.addEventListener = vi.fn().mockImplementation(handler => {
    handlers.push(handler);
  });
});

describe('messageChannelLink', () => {
  test('can create messageChannelLink', () => {
    const mock = vi.mocked(port);
    expect(() =>
      createTRPCProxyClient({
        links: [
          messageChannelLink({
            client: createMessagePortClient({
              port: mock,
            }),
          }),
        ],
      })
    ).not.toThrow();
  });

  describe('operations', () => {
    let client: ReturnType<typeof createTRPCProxyClient<Router>>;
    const mock = vi.mocked(port);

    beforeEach(() => {
      client = createTRPCProxyClient({
        links: [
          messageChannelLink({
            client: createMessagePortClient({
              port: mock,
            }),
          }),
        ],
      });
    });

    test('routes query to/from', async () => {
      const queryResponse = vi.fn();

      const query = client.testQuery.query().then(queryResponse);

      expect(mock.postMessage).toHaveBeenCalledTimes(1);
      expect(mock.postMessage).toHaveBeenCalledWith({
        method: 'request',
        operation: {
          context: {},
          id: 1,
          input: undefined,
          path: 'testQuery',
          type: 'query',
        },
      });

      expect(queryResponse).not.toHaveBeenCalled();

      handlers[0]({
        id: 1,
        result: {
          type: 'data',
          data: 'query success',
        },
      });

      await query;

      expect(queryResponse).toHaveBeenCalledTimes(1);
      expect(queryResponse).toHaveBeenCalledWith('query success');
    });

    test('routes mutation to/from', async () => {
      const mutationResponse = vi.fn();

      const mutation = client.testMutation.mutate('test input').then(mutationResponse);

      expect(mock.postMessage).toHaveBeenCalledTimes(1);
      expect(mock.postMessage).toHaveBeenCalledWith({
        method: 'request',
        operation: {
          context: {},
          id: 1,
          input: 'test input',
          path: 'testMutation',
          type: 'mutation',
        },
      });

      mock.postMessage.mockClear();

      handlers[0]({
        id: 1,
        result: {
          type: 'data',
          data: 'mutation success',
        },
      });

      await mutation;

      expect(mutationResponse).toHaveBeenCalledTimes(1);
      expect(mutationResponse).toHaveBeenCalledWith('mutation success');
    });

    test('routes subscription to/from', async () => {
      /*
       * Subscription is routed to the server
       */
      const subscriptionResponse = vi.fn();
      const subscriptionComplete = vi.fn();

      const subscription = client.testSubscription.subscribe(undefined, {
        onData: subscriptionResponse,
        onComplete: subscriptionComplete,
      });

      expect(mock.postMessage).toHaveBeenCalledTimes(1);
      expect(mock.postMessage).toHaveBeenCalledWith({
        method: 'request',
        operation: {
          context: {},
          id: 1,
          input: undefined,
          path: 'testSubscription',
          type: 'subscription',
        },
      });

      /*
       * Multiple responses from the server
       */
      const respond = (str: string) =>
        handlers[0]({
          id: 1,
          result: {
            type: 'data',
            data: str,
          },
        });

      respond('test 1');
      respond('test 2');
      respond('test 3');

      expect(subscriptionResponse).toHaveBeenCalledTimes(3);
      expect(subscriptionComplete).not.toHaveBeenCalled();

      /*
       * Unsubscribe informs the server
       */
      subscription.unsubscribe();

      expect(mock.postMessage).toHaveBeenCalledTimes(2);
      expect(mock.postMessage.mock.calls[1]).toEqual([
        {
          id: 1,
          method: 'subscription.stop',
        },
      ]);

      expect(subscriptionComplete).toHaveBeenCalledTimes(1);

      /*
       * Should not receive any more messages after unsubscribing
       */
      respond('test 4');

      expect(subscriptionResponse).toHaveBeenCalledTimes(3);
    });

    test('interlaces responses', async () => {
      const queryResponse1 = vi.fn();
      const queryResponse2 = vi.fn();
      const queryResponse3 = vi.fn();

      const query1 = client.testQuery.query().then(queryResponse1);
      /* const query2 = */ client.testQuery.query().then(queryResponse2);
      const query3 = client.testQuery.query().then(queryResponse3);

      expect(mock.postMessage).toHaveBeenCalledTimes(3);

      expect(queryResponse1).not.toHaveBeenCalled();
      expect(queryResponse2).not.toHaveBeenCalled();
      expect(queryResponse3).not.toHaveBeenCalled();

      // Respond to queries in a different order
      handlers[0]({
        id: 1,
        result: {
          type: 'data',
          data: 'query success 1',
        },
      });
      handlers[0]({
        id: 3,
        result: {
          type: 'data',
          data: 'query success 3',
        },
      });

      await Promise.all([query1, query3]);

      expect(queryResponse1).toHaveBeenCalledTimes(1);
      expect(queryResponse1).toHaveBeenCalledWith('query success 1');
      expect(queryResponse2).not.toHaveBeenCalled();
      expect(queryResponse3).toHaveBeenCalledTimes(1);
      expect(queryResponse3).toHaveBeenCalledWith('query success 3');
    });
  });
});
