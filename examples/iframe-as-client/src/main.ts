import { applyMessagePortHandler } from 'message-channel-trpc/server';
import { appRouter } from './router';

const { port1, port2 } = new MessageChannel();

const ifr = document.querySelector('iframe');
const otherWindow = ifr?.contentWindow;

ifr?.addEventListener('load', iframeLoaded, false);

function iframeLoaded() {
  otherWindow?.postMessage('port', '*', [port2]);
}
port1.start();
applyMessagePortHandler({ port: port1, router: appRouter });
