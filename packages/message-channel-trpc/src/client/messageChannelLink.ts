import { AnyRouter, inferRouterError, ProcedureType } from '@trpc/server';
import {
  TRPCResponseMessage,
  TRPCClientOutgoingMessage,
  TRPCRequestMessage,
  TRPCClientIncomingMessage,
} from '@trpc/server/rpc';
import { TRPCClientError, TRPCLink, Operation } from '@trpc/client';
import { Observer, UnsubscribeFn, observable } from '@trpc/server/observable';
import { transformResult } from './internal';
import type { MessagePortMain, MessagePort } from '../type';

type MessagePortCallbackResult<TRouter extends AnyRouter, TOutput> = TRPCResponseMessage<
  TOutput,
  inferRouterError<TRouter>
>;

type MessagePortCallbackObserver<TRouter extends AnyRouter, TOutput> = Observer<
  MessagePortCallbackResult<TRouter, TOutput>,
  TRPCClientError<TRouter>
>;

export interface MessageChannelLinkOptions {
  client: ReturnType<typeof createMessagePortClient>;
}

class TRPCSubscriptionEndedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TRPCSubscriptionEndedError';
    Object.setPrototypeOf(this, TRPCSubscriptionEndedError.prototype);
  }
}

export interface MessagePortClientOptions {
  port: MessagePort | MessagePortMain;
}

export function createMessagePortClient(opts: MessagePortClientOptions) {
  const { port } = opts;
  /**
   * outgoing messages buffer whilst not open
   */
  let outgoing: TRPCClientOutgoingMessage[] = [];
  /**
   * pending outgoing requests that are awaiting callback
   */
  type TCallbacks = MessagePortCallbackObserver<AnyRouter, unknown>;
  type TRequest = {
    /**
     * Reference to the MessagePort instance this request was made to
     */
    port: MessagePort | MessagePortMain;
    type: ProcedureType;
    callbacks: TCallbacks;
    op: Operation;
  };
  const pendingRequests: Record<number | string, TRequest> = Object.create(null);

  let dispatchTimer: NodeJS.Timer | number | null = null;
  let connectTimer: NodeJS.Timer | number | null = null;
  const activePort = createMessagePort();
  /**
   * tries to send the list of messages
   */
  function dispatch() {
    if (dispatchTimer != null) {
      return;
    }
    dispatchTimer = setTimeout(() => {
      dispatchTimer = null;

      if (outgoing.length === 1) {
        // single send
        activePort.postMessage(JSON.stringify(outgoing.pop()));
      } else {
        // batch send
        activePort.postMessage(JSON.stringify(outgoing));
      }
      // clear
      outgoing = [];
    });
  }

  function createMessagePort() {
    if (connectTimer != null) clearTimeout(connectTimer);
    connectTimer = null;

    // eslint-disable-next-line unicorn/consistent-function-scoping
    const handleIncomingResponse = (data: TRPCResponseMessage) => {
      const req = data.id !== null && pendingRequests[data.id];
      if (req === false || req == null) {
        // do something?
        return;
      }

      req.callbacks.next(data);

      if ('result' in data && data.result.type === 'stopped') {
        req.callbacks.complete();
      }
    };

    const onMessage = ({ data }: { data: string }) => {
      const msg = JSON.parse(data) as TRPCClientIncomingMessage;

      if (!('method' in msg)) {
        handleIncomingResponse(msg);
      }
    };

    if ('on' in port) {
      port.on('message', onMessage);
    } else {
      port.addEventListener('message', onMessage);
    }

    return port;
  }

  function request(op: Operation, callbacks: TCallbacks): UnsubscribeFn {
    const { type, input, path, id } = op;
    const envelope: TRPCRequestMessage = {
      id,
      method: type,
      params: {
        input,
        path,
      },
    };
    pendingRequests[id] = {
      port: activePort,
      type,
      callbacks,
      op,
    };

    // enqueue message
    outgoing.push(envelope);
    dispatch();

    return () => {
      const callbacks = pendingRequests[id]?.callbacks;
      delete pendingRequests[id];
      outgoing = outgoing.filter(msg => msg.id !== id);

      callbacks?.complete();
      if (type === 'subscription') {
        outgoing.push({
          id,
          method: 'subscription.stop',
        });
        dispatch();
      }
    };
  }
  return {
    request,
    getConnection() {
      return activePort;
    },
  };
}

export function messageChannelLink<TRouter extends AnyRouter>(
  opts: MessageChannelLinkOptions
): TRPCLink<TRouter> {
  return runtime => {
    const { client } = opts;
    return ({ op }) => {
      return observable(observer => {
        const { type, path, id, context } = op;

        const input = runtime.transformer.serialize(op.input);

        let isDone = false;
        const unsub = client.request(
          { type, path, input, id, context },
          {
            error(err) {
              isDone = true;
              observer.error(err as TRPCClientError<TRouter>);
              unsub();
            },
            complete() {
              if (isDone) {
                observer.complete();
              } else {
                isDone = true;
                observer.error(
                  TRPCClientError.from(
                    new TRPCSubscriptionEndedError('Operation ended prematurely')
                  )
                );
              }
            },
            next(message) {
              const transformed = transformResult(message, runtime);

              if (!transformed.ok) {
                observer.error(TRPCClientError.from(transformed.error));
                return;
              }
              observer.next({
                result: transformed.result,
              });

              if (type !== 'subscription') {
                // if it isn't a subscription we don't care about next response

                isDone = true;
                unsub();
                observer.complete();
              }
            },
          }
        );
        return () => {
          isDone = true;
          unsub();
        };
      });
    };
  };
}
