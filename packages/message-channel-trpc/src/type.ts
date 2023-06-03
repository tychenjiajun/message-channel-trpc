export type MessagePortMain = {
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

  postMessage(message: any): void;
};

export type MessagePort = {
  postMessage(message: any): void;
  addEventListener(type: 'message', listener: (messageEvent: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (messageEvent: MessageEvent) => void): void;
};
