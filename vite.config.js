import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiHost = process.env.API_HOST || env.API_HOST || '127.0.0.1';
  const apiPort = process.env.API_PORT || env.API_PORT || '8787';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://${apiHost}:${apiPort}`,
      },
    },
  };
});