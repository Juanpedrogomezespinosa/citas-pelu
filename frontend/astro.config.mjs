// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

const { API_PROXY_TARGET = 'http://localhost:4000' } = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');

/**
 * Sitio estático (output por defecto): las páginas .astro se sirven como HTML
 * sin JS, y solo las "islas" React se hidratan en el navegador. Los datos se
 * piden en cliente a la API (requiere sesión), no en tiempo de build.
 *
 * La API se sirve bajo el MISMO origen en /api: en desarrollo con el proxy de
 * Vite y en producción con nginx. Así la cookie de sesión (httpOnly,
 * SameSite=Strict) funciona sin CORS y sin exponer el token a JavaScript.
 */
export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/api': { target: API_PROXY_TARGET, changeOrigin: false },
      },
    },
  },
  server: { port: 4321 },
});
