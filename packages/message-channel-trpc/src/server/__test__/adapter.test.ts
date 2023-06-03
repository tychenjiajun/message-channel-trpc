import { beforeEach, describe, expect, MockedFunction, test, vi } from 'vitest';
import { z } from 'zod';
import * as trpc from '@trpc/server';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';
import { applyMessagePortHandler } from '../adapter';

const ee = new EventEmitter();

const t = trpc.initTRPC.create();
const testRouter = t.router({
  testQuery: t.procedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(({ input }) => {
      return { id: input.id, isTest: true };
    }),
  testSubscription: t.procedure.subscription(() => {
    return observable(emit => {
      function testResponse() {
        emit.next('test response');
      }

      ee.on('test', testResponse);
      return () => ee.off('test', testResponse);
    });
  }),
});

let handlers: ((e: { data: string }) => void)[] = [];

const port: MessagePort = {
  postMessage: vi.fn(),
  addEventListener: vi.fn().mockImplementation((_msg, handler) => {
    handlers.push(handler);
  }),
} as any;

applyMessagePortHandler({ port, router: testRouter });

beforeEach(() => {
  vi.useFakeTimers();
  vi.restoreAllMocks();
});

describe('api', () => {
  test('handles queries', async () => {
    handlers[0]({
      data: '{"id":1,"method":"query","params":{"path":"testQuery","input":{"id":"233"}}}',
    });

    await vi.runAllTimersAsync();

    expect(port.postMessage).toHaveBeenCalledOnce();
    expect(port.postMessage).toHaveBeenCalledWith(
      '{"id":1,"result":{"type":"data","data":{"id":"233","isTest":true}}}'
    );
  });
});
