import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Um ano: são recursos imutáveis, com hash no nome ou versionados na origem. */
const ONE_YEAR = 60 * 60 * 24 * 365;

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' e não 'autoUpdate': recarregar sozinho no meio de um estudo
      // perderia a sessão — velocidade, loop e a posição na peça.
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Piano Tutor',
        short_name: 'Piano Tutor',
        description: 'Estude piano com as notas caindo, partitura e modo espera.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#12141c',
        theme_color: '#12141c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Só o app entra no precache. O chunk do Verovio tem ~12MB: baixá-lo na
        // instalação do service worker arruinaria o primeiro carregamento de
        // quem só quer abrir um `.mid`. Ele entra em cache no primeiro uso.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        globIgnores: ['**/verovio-module*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // O motor de gravação, sob demanda.
            urlPattern: /\/assets\/verovio-module.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'verovio-engine',
              expiration: { maxEntries: 2, maxAgeSeconds: ONE_YEAR },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Samples de piano. O CDN libera CORS, então são respostas de
            // verdade e não opacas — dá para conferir o status e o tamanho.
            urlPattern: /^https:\/\/danigb\.github\.io\/samples\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'piano-samples',
              expiration: { maxEntries: 400, maxAgeSeconds: ONE_YEAR },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Índice do catálogo: buscar a versão nova quando houver rede, mas
            // continuar funcionando sem ela.
            urlPattern: /\/catalog\/humdrum\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'catalog-index',
              expiration: { maxEntries: 2, maxAgeSeconds: ONE_YEAR },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
