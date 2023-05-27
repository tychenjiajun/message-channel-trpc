import { applyMessagePortHandlers } from 'message-channel-trpc/server';

const { port1, port2 } = new MessageChannel();

const ifr = document.querySelector('iframe');
const otherWindow = ifr?.contentWindow;

ifr?.addEventListener('load', iframeLoaded, false);

function iframeLoaded() {
  otherWindow?.postMessage('Hello from the main page!', '*', [port2]);
}
port1.start();
applyMessagePortHandler(port1);
