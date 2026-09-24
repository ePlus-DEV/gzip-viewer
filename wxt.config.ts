import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'SEO & AEO Auditor',
    version: '1.5.0',
    description: 'Run AEO and SEO website audits or explore llms.txt, sitemaps and product feeds.',
    permissions: ['tabs', 'storage'],
    // The URL is chosen by the user; the viewer does not send data to another service.
    host_permissions: ['<all_urls>'],
  },
});
