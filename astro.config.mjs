// @ts-check
import { defineConfig } from "astro/config";
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import sanity from '@sanity/astro';

// https://astro.build/config
export default defineConfig({
  integrations: [
    react(),
    sanity({
      projectId: 'sovnyov1',
      dataset: 'production',
      useCdn: true,
      apiVersion: '2024-03-01',
    }),
  ],
  output: 'server', // SSR by default, pages with prerender: true will be static
  adapter: cloudflare({
    imageService: 'cloudflare', // Use Cloudflare Image Resizing
  }),
  vite: {
    plugins: [
      // ── DEV-ONLY: intercept miniflare/workerd "fetch failed" ──────────
      //
      // Root cause: workerd's scryptAsync (password hashing) allocates
      // ~64 MB.  For non-2xx auth responses the TCP socket between
      // Node/undici and workerd is torn down before the HTTP body can be
      // read.  The @cloudflare/vite-plugin catches the resulting
      // TypeError("fetch failed") and calls Connect's next(err).
      //
      // Connect then searches FORWARD through the middleware stack for a
      // 4-argument error handler.  Vite registers its own
      // `viteErrorMiddleware` as the LAST entry (line 25626 of config.js).
      // That handler calls logError() → sends an HMR error overlay via
      // WebSocket AND renders an HTML error page — both undesirable for
      // a simple "wrong password" API call.
      //
      // Fix: after all plugins have registered their middleware, we
      // splice our error handler into the stack RIGHT BEFORE
      // viteErrorMiddleware.  This way Connect finds our handler first,
      // we return a clean JSON response, and Vite's overlay never fires.
      {
        name: 'auth-dev-error-recovery',
        configureServer(server) {
          return () => {
            // setTimeout(0) ensures ALL plugins (including the Astro
            // cloudflare integration) have finished registering middleware.
            setTimeout(() => {
              const stack = server.middlewares.stack;

              // Find Vite's built-in error middleware by its function name.
              const viteErrIdx = stack.findIndex(
                // @ts-ignore – internal Vite middleware stack typing
                (layer) => layer.handle.name === 'viteErrorMiddleware',
              );

              const errorHandler = {
                route: '',
                handle: /** @type {function(any, any, any, any): void} */
                  function authDevErrorHandler(err, req, res, next) {
                    const url = req.originalUrl || req.url || '';
                    const isApiRoute = url.startsWith('/api/');
                    const isFetchFailed =
                      err instanceof TypeError && err.message === 'fetch failed';

                    if (isApiRoute && isFetchFailed && !res.headersSent) {
                      let status = 503;
                      let message = 'Service temporarily unavailable';

                      if (url.startsWith('/api/auth')) {
                        if (url.includes('/sign-up')) {
                          status = 422;
                          message = 'Registration failed. Please try again.';
                        } else if (
                          url.includes('/forget-password') ||
                          url.includes('/reset-password')
                        ) {
                          message =
                            'Password reset service temporarily unavailable.';
                        } else if (url.includes('/sign-in')) {
                          status = 401;
                          message = 'Invalid email or password';
                        }
                      } else if (url.startsWith('/api/favorites')) {
                        status = 401;
                        message = 'Authentication required';
                      }

                      res.writeHead(status, {
                        'Content-Type': 'application/json',
                      });
                      res.end(JSON.stringify({ error: message }));
                      return;
                    }

                    next(err);
                  },
              };

              if (viteErrIdx >= 0) {
                // Insert RIGHT BEFORE viteErrorMiddleware.
                stack.splice(viteErrIdx, 0, errorHandler);
              } else {
                // Fallback: push to end (should not happen).
                stack.push(errorHandler);
              }
            }, 0);
          };
        },
      },
    ],
    // Stripe’s Node SDK breaks Vite’s SSR dep optimizer on Cloudflare dev
    // (missing deps_ssr/stripe.js). Load it from node_modules instead.
    optimizeDeps: {
      exclude: ['stripe'],
    },
    ssr: {
      optimizeDeps: {
        exclude: ['stripe'],
      },
    },
    build: {
      cssMinify: 'lightningcss',
      // Better code splitting
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Separate vendor chunks
            if (id.includes('node_modules')) {
              if (id.includes('lottie-web')) {
                return 'lottie';
              }
              if (id.includes('react')) {
                return 'react-vendor';
              }
              return 'vendor';
            }
          },
        },
      },
    },
  },
  server: {},
  // Prefetch configuration for faster navigation
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});

