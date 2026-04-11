// @ts-check
import { defineConfig } from "astro/config";
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import sanity from '@sanity/astro';

// https://astro.build/config
export default defineConfig({
  // Used for canonical URLs, sitemap, and import.meta.env.SITE (override in production via PUBLIC_SITE_URL)
  site: process.env.PUBLIC_SITE_URL || 'https://visupair.com',
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
                          url.includes('/request-password-reset') ||
                          url.includes('/reset-password')
                        ) {
                          message =
                            'Password reset service temporarily unavailable.';
                        } else if (url.includes('/sign-in')) {
                          status = 401;
                          message = 'Invalid email or password';
                        } else if (url.includes('/change-password')) {
                          message =
                            'Could not change password (dev server link error). Try restarting `npm run dev` or use the same host as BETTER_AUTH_URL (localhost vs 127.0.0.1).';
                        } else if (url.includes('/change-email')) {
                          message =
                            'Could not change email (dev server link error). Try restarting the dev server.';
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
    // Stripe / Sanity: Vite SSR dep optimizer on Cloudflare dev can point at
    // missing deps_ssr/*.js (race or incompatible prebundle). Load from source.
    optimizeDeps: {
      exclude: ['stripe', '@sanity/image-url'],
      // Fewer mid-serve optimize passes; see server.watch for WSL2 + Miniflare race.
      ignoreOutdatedRequests: true,
      holdUntilCrawlEnd: true,
    },
    ssr: {
      optimizeDeps: {
        exclude: ['stripe', '@sanity/image-url'],
        ignoreOutdatedRequests: true,
        holdUntilCrawlEnd: true,
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
  // WSL2 / cross-OS mounts: chokidar can fire bursts of file events → dep re-optimization →
  // Miniflare disposed while Cloudflare middleware still runs ("Expected miniflare to be defined").
  server: {
    watch: {
      usePolling: Boolean(
        process.env.WSL_DISTRO_NAME || process.env.VISUPAIR_VITE_POLL,
      ),
      interval: 400,
    },
  },
  // Prefetch configuration for faster navigation
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});

