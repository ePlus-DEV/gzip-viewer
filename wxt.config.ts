import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'SEO & AEO Auditor',
    version: '1.7.0',
    description: 'Audit AEO and SEO with an accessible beUI-powered Chrome interface.',
    permissions: ['tabs', 'storage'],
    // Users choose arbitrary site origins; no staging endpoint is embedded.
    host_permissions: ['<all_urls>'],
  },
});
