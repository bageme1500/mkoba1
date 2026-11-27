import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development, calls to /api/* are forwarded to the Express API on port 4000,
// so the browser sees one origin and no CORS setup is needed.
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: process.env.API_URL || 'http://localhost:4000',
                rewrite: (path) => path.replace(/^\/api/, ''),
            },
        },
    },
});
