import {defineConfig} from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({plugins: [tailwindcss()]}),
  manifest: {
    name: 'SEO & AEO Auditor',
    version: '1.9.1',
    description: 'Audit XML sitemaps, LLMS, agents and multilingual product feeds.',
    permissions: ['tabs','storage','notifications'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: '/icon-16.png',
      32: '/icon-32.png',
      48: '/icon-48.png',
      128: '/icon-128.png',
    },
    action: {
      default_icon: {
        16: '/icon-16.png',
        32: '/icon-32.png',
        48: '/icon-48.png',
        128: '/icon-128.png',
      },
    },
  },
});
