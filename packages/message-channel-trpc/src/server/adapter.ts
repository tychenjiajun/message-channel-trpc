import {
  AnyRouter,
  ProcedureType,
  callProcedure,
  inferRouterContext,
  TRPCError,
  CombinedDataTransformer,
} from '@trpc/server';
import {
  JSONRPC2,
  TRPCClientOutgoingMessage,
  TRPCResponseMessage,
  TRPCReconnectNotification,
} from '@trpc/server/rpc';
import { transformTRPCResponse, getErrorShape } from '@trpc/server/shared';
import { Unsubscribable, isObservable } from '@trpc/server/observable';
import { getTRPCErrorFromUnknown, getCauseFromUnknown } from './utils';

type MessagePortMain = {
  // Docs: https://electronjs.org/docs/api/message-port-main

  /**
   * Emitted when the remote end of a MessagePortMain object becomes disconnected.
   */
  on(event: 'close', listener: Function): void;
  once(event: 'close', listener: Function): void;
  /**
   * Emitted when a MessagePortMain object receives a message.
   */
  on(event: 'message', listener: (messageEvent: MessageEvent) => void): void;
  once(event: 'message', listener: (messageEvent: MessageEvent) => void): void;

  postMessage(message: any, transfer?: MessagePortMain[]): void;
};

type OnErrorFunction<TRouter extends AnyRouter> = (opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: undefined | inferRouterContext<TRouter>;
}) => void;

interface BaseHandlerOptions<TRouter extends AnyRouter> {
  onError?: OnErrorFunction<TRouter>;
  batching?: {
    enabled: boolean;
  };
  router: TRouter;
}

/* istanbul ignore next -- @preserve */
function assertIsObject(obj: unknown): asserts obj is Record<string, unknown> {
  if (typeof obj !== 'object' || Array.isArray(obj) || !obj) {
    throw new Error('Not an object');
  }
}
/* istanbul ignore next -- @preserve */
function assertIsProcedureType(obj: unknown): asserts obj is ProcedureType {
  if (obj !== 'query' && obj !== 'subscription' && obj !== 'mutation') {
    throw new Error('Invalid procedure type');
  }
}
/* istanbul ignore next -- @preserve */
function assertIsRequestId(obj: unknown): asserts obj is number | string | null {
  if (obj !== null && typeof obj === 'number' && Number.isNaN(obj) && typeof obj !== 'string') {
    throw new Error('Invalid request id');
  }
}
/* istanbul ignore next -- @preserve */
function assertIsString(obj: unknown): asserts obj is string {
  if (typeof obj !== 'string') {
    throw new TypeError('Invalid string');
  }
}
/* istanbul ignore next -- @preserve */
function assertIsJSONRPC2OrUndefined(obj: unknown): asserts obj is '2.0' | undefined {
  if (obj !== undefined && obj !== '2.0') {
    throw new Error('Must be JSONRPC 2.0');
  }
}

function parseMessage(
  obj: unknown,
  transformer: CombinedDataTransformer
): TRPCClientOutgoingMessage {
  assertIsObject(obj);
  const { method, params, id, jsonrpc } = obj;
  assertIsRequestId(id);
  assertIsJSONRPC2OrUndefined(jsonrpc);
  if (method === 'subscription.stop') {
    return {
      id,
      jsonrpc,
      method,
    };
  }
  assertIsProcedureType(method);
  assertIsObject(params);

  const { input: rawInput, path } = params;
  assertIsString(path);
  const input = transformer.input.deserialize(rawInput);
  return {
    id,
    jsonrpc,
    method,
    params: {
      input,
      path,
    },
  };
}
export type MessagePortHandlerOptions<TRouter extends AnyRouter> = BaseHandlerOptions<TRouter> & {
  port: MessagePortMain | MessagePort;
};

export function applyMessagePortHandler<TRouter extends AnyRouter>(
  opts: MessagePortHandlerOptions<TRouter>
) {
  const { port, router } = opts;

  const { transformer } = router._def._config;

  const clientSubscriptions = new Map<number | string, Unsubscribable>();

  function respond(untransformedJSON: TRPCResponseMessage) {
    port.postMessage(JSON.stringify(transformTRPCResponse(router._def._config, untransformedJSON)));
  }

  function stopSubscription(
    subscription: Unsubscribable,
    { id, jsonrpc }: { id: JSONRPC2.RequestId } & JSONRPC2.BaseEnvelope
  ) {
    subscription.unsubscribe();

    respond({
      id,
      jsonrpc,
      result: {
        type: 'stopped',
      },
    });
  }

  async function handleRequest(msg: TRPCClientOutgoingMessage) {
    // @ts-ignore
    const { id, jsonrpc, method, params } = msg;
    /* istanbul ignore next -- @preserve */
    if (id === null) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '`id` is required',
      });
    }
    if (method === 'subscription.stop') {
      const sub = clientSubscriptions.get(id);
      if (sub) {
        stopSubscription(sub, { id, jsonrpc });
      }
      clientSubscriptions.delete(id);
      return;
    }
    const { path, input } = params;
    const type = method;
    try {
      const result = await callProcedure({
        procedures: router._def.procedures,
        path,
        rawInput: input,
        ctx: null,
        type,
      });

      if (type === 'subscription') {
        if (!isObservable(result)) {
          throw new TRPCError({
            message: `Subscription ${path} did not return an observable`,
            code: 'INTERNAL_SERVER_ERROR',
          });
        }
      } else {
        // send the value as data if the method is not a subscription
        respond({
          id,
          jsonrpc,
          result: {
            type: 'data',
            data: result,
          },
        });
        return;
      }

      const sub = result.subscribe({
        next(data) {
          respond({
            id,
            jsonrpc,
            result: {
              type: 'data',
              data,
            },
          });
        },
        error(err) {
          const error = getTRPCErrorFromUnknown(err);
          opts.onError?.({ error, path, type, ctx: null, input });
          respond({
            id,
            jsonrpc,
            error: getErrorShape({
              config: router._def._config,
              error,
              type,
              path,
              input,
              ctx: null,
            }),
          });
        },
        complete() {
          respond({
            id,
            jsonrpc,
            result: {
              type: 'stopped',
            },
          });
        },
      });

      /* istanbul ignore next -- @preserve */
      if (clientSubscriptions.has(id)) {
        // duplicate request ids for client
        stopSubscription(sub, { id, jsonrpc });
        throw new TRPCError({
          message: `Duplicate id ${id}`,
          code: 'BAD_REQUEST',
        });
      }
      clientSubscriptions.set(id, sub);

      respond({
        id,
        jsonrpc,
        result: {
          type: 'started',
        },
      });
    } catch (cause) /* istanbul ignore next -- @preserve */ {
      // procedure threw an error
      const error = getTRPCErrorFromUnknown(cause);
      opts.onError?.({ error, path, type, ctx: null, input });
      respond({
        id,
        jsonrpc,
        error: getErrorShape({ config: router._def._config, error, type, path, input, ctx: null }),
      });
    }
  }

  const onMessage = async ({ data }: { data: string }) => {
    try {
      const msgJSON: unknown = JSON.parse(data);
      const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];
      const promises = msgs.map(raw => parseMessage(raw, transformer)).map(handleRequest);
      await Promise.all(promises);
    } catch (cause) {
      const error = new TRPCError({
        code: 'PARSE_ERROR',
        cause: getCauseFromUnknown(cause),
      });

      respond({
        id: null,
        error: getErrorShape({
          config: router._def._config,
          error,
          type: 'unknown',
          path: undefined,
          input: undefined,
          ctx: undefined,
        }),
      });
    }
  };

  const onceClose = () => {
    for (const sub of clientSubscriptions.values()) {
      sub.unsubscribe();
    }
    clientSubscriptions.clear();
  };

  if ('on' in port) {
    port.on('message', onMessage);
    port.once('close', onceClose);
  } else {
    port.onmessage = onMessage;
  }

  return {
    broadcastReconnectNotification: () => {
      const response: TRPCReconnectNotification = {
        id: null,
        method: 'reconnect',
      };
      const data = JSON.stringify(response);

      port.postMessage(data);
    },
  };
}
