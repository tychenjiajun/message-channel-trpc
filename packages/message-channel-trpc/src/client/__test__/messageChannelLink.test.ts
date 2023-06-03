import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createTRPCProxyClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
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
let handlers: ((e: { data: string }) => void)[] = [];

const port: MessagePort = {
  postMessage: vi.fn(),
  addEventListener: vi.fn().mockImplementation((_msg, handler) => {
    handlers.push(handler);
  }),
} as any;


beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
});

describe('messageChannelLink', () => {
  test('can create messageChannelLink', () => {
    expect(() =>
      createTRPCProxyClient({
        links: [
          messageChannelLink({
            client: createMessagePortClient({
              port,
            }),
          }),
        ],
      })
    ).not.toThrow();
  });

  describe('operations', () => {
    const client = createTRPCProxyClient<Router>({
      links: [
        messageChannelLink({
          client: createMessagePortClient({
            port,
          }),
        }),
      ],
    });

    test('routes query to/from', async () => {
      const queryResponse = vi.fn();

      const query = client.testQuery.query().then(queryResponse);

      await vi.runAllTimersAsync();

      expect(port.postMessage).toHaveBeenCalledTimes(1);
      expect(port.postMessage).toHaveBeenCalledWith(
        '{"id":1,"method":"query","params":{"path":"testQuery"}}'
      );

      expect(queryResponse).not.toHaveBeenCalled();

      handlers[0]({
        data: '{"id":1,"jsonrpc":"2.0","result":{"type":"data","data":"query success"}}',
      });

      await query;

      expect(queryResponse).toHaveBeenCalledTimes(1);
      expect(queryResponse).toHaveBeenCalledWith('query success');
    });

    test('routes mutation to/from', async () => {
      const mutationResponse = vi.fn();

      const mutation = client.testMutation.mutate('test input').then(mutationResponse);

      await vi.runAllTimersAsync();

      expect(port.postMessage).toHaveBeenCalledTimes(1);
      expect(port.postMessage).toHaveBeenCalledWith(
        '{"id":2,"method":"mutation","params":{"input":"test input","path":"testMutation"}}'
      );

      await vi.runAllTimersAsync();

      handlers[0]({
        data: '{"id":2,"jsonrpc":"2.0","result":{"type":"data","data":"mutation success"}}',
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

      await vi.runAllTimersAsync();

      expect(port.postMessage).toHaveBeenCalledTimes(1);
      expect(port.postMessage).toHaveBeenCalledWith(
        '{"id":3,"method":"subscription","params":{"path":"testSubscription"}}'
      );

      /*
       * Multiple responses from the server
       */
      const respond = (str: string) =>
        handlers[0]({
          data: '{"id":3,"jsonrpc":"2.0","result":{"type":"data","data":"' + str + '"}}',
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

      await vi.runAllTimersAsync();

      expect(port.postMessage).toHaveBeenCalledTimes(2);
      expect(port.postMessage).lastCalledWith('{"id":3,"method":"subscription.stop"}');

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

      await vi.runAllTimersAsync();

      expect(port.postMessage).toHaveBeenCalledTimes(1);

      expect(queryResponse1).not.toHaveBeenCalled();
      expect(queryResponse2).not.toHaveBeenCalled();
      expect(queryResponse3).not.toHaveBeenCalled();

      // Respond to queries in a different order
      handlers[0]({
        data: '{"id":4,"jsonrpc":"2.0","result":{"type":"data","data":"query success 1"}}',
      });
      handlers[0]({
        data: '{"id":6,"jsonrpc":"2.0","result":{"type":"data","data":"query success 3"}}',
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
