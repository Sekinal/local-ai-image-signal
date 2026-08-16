import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  manifest: {
    name: 'Local AI Image Signal',
    description:
      'Automatically label webpage images with local AI-generation signals. Evidence, not proof.',
    minimum_chrome_version: '127',
    permissions: ['activeTab', 'contextMenus', 'offscreen', 'scripting', 'storage'],
    host_permissions: ['http://*/*', 'https://*/*'],
    action: {
      default_title: 'Screen visible images',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
    },
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'",
    },
  },
  vite: () => ({
    build: { target: 'es2022' },
  }),
});
