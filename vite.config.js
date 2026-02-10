import { defineConfig } from 'vite';

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const pagesBase = repoName ? `/${repoName}/` : '/';
const base =
  process.env.VITE_BASE ||
  (process.env.GITHUB_PAGES === '1' ? pagesBase : '/');

// Vite 7 host validation blocks LAN requests unless explicitly allowed.
// This config allows access via mDNS name + common local IPs.
export default defineConfig({
  base,
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
