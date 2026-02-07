import { defineConfig } from 'vite';

// Vite 7 host validation blocks LAN requests unless explicitly allowed.
// This config allows access via mDNS name + common local IPs.
export default defineConfig({
  server: {
    host: true,
    port: 5176,
    strictPort: true,
    allowedHosts: [
      'kunlun.local',
      'localhost',
      '127.0.0.1',
      '192.168.50.118',
      '192.168.50.150',
      '100.111.147.47',
    ],
  },
  preview: {
    host: true,
    port: 5176,
    strictPort: true,
    allowedHosts: [
      'kunlun.local',
      'localhost',
      '127.0.0.1',
      '192.168.50.118',
      '192.168.50.150',
      '100.111.147.47',
    ],
  },
});
