import { defineConfig } from 'vitepress';
import UnoCSS from 'unocss/vite';

export default defineConfig({
  title: 'message-channel-trpc',
  description: 'Just playing around.',
  themeConfig: {
    repo: 'tychenjiajun/message-channel-trpc',
    nav: [{ text: 'Guide', link: '/getting-started' }],
    sidebar: [
      {
        text: 'Guide',
        items: [{ text: 'Getting Started', link: '/getting-started' }],
      },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2023-present Jiajun Chen',
    },
  },
  vite: {
    plugins: [UnoCSS({})],
  },
});
