import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'GZIP JSONL Viewer',
    version: '1.3.0',
    description: 'Inspect and validate remote JSON, JSONL, and GZIP JSONL feeds inside Chrome.',
    permissions: ['tabs', 'storage'],
    // The URL is chosen by the user; the viewer does not send data to another service.
    host_permissions: ['<all_urls>'],
  },
});
