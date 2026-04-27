import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import tsconfigPaths from "vite-tsconfig-paths";

const indexHtmlPath = resolve("build/client/index.html");
const serviceWorkerPath = resolve("build/client/sw.js");
const indexHtmlPrecacheEntryPattern =
  /\{\s*"url":\s*"\/index\.html",\s*"revision":\s*(?:null|"[a-f0-9]+")\s*\}/;

let isIndexHtmlRevisionPatchScheduled = false;

function getSiteOrigin() {
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionUrl) return `https://${productionUrl}`;
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return "";
}

function isMissingFile(cause: unknown) {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}

async function writeIndexHtmlPrecacheRevision() {
  const indexHtml = await readFile(indexHtmlPath);
  const revision = createHash("sha256").update(indexHtml).digest("hex");
  const serviceWorker = await readFile(serviceWorkerPath, "utf8");
  const patchedServiceWorker = serviceWorker.replace(
    indexHtmlPrecacheEntryPattern,
    JSON.stringify({ url: "/index.html", revision }),
  );

  if (patchedServiceWorker === serviceWorker) {
    throw new Error("Unable to patch /index.html precache revision in build/client/sw.js");
  }

  await writeFile(serviceWorkerPath, patchedServiceWorker);
}

function scheduleIndexHtmlPrecacheRevisionPatch() {
  if (isIndexHtmlRevisionPatchScheduled) return;
  isIndexHtmlRevisionPatchScheduled = true;

  process.once("beforeExit", () => {
    writeIndexHtmlPrecacheRevision().catch((cause) => {
      console.error(cause);
      process.exitCode = 1;
    });
  });
}

function patchIndexHtmlPrecacheRevision(): Plugin {
  return {
    name: "patch-index-html-precache-revision",
    enforce: "post",
    apply: "build",
    async closeBundle() {
      try {
        await writeIndexHtmlPrecacheRevision();
      } catch (cause) {
        if (isMissingFile(cause)) {
          scheduleIndexHtmlPrecacheRevisionPatch();
          return;
        }

        throw cause;
      }
    },
  };
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
    VitePWA({
      registerType: "prompt",
      strategies: "generateSW",
      workbox: {
        globPatterns: [
          "**/*.{js,css,html}",
          "fonts/**/*.woff2",
          "*.svg",
          "*.png",
          "favicon-*.png",
          "apple-touch-icon*",
          "og-image.png",
        ],
        cleanupOutdatedCaches: true,
        additionalManifestEntries: [{ url: "/index.html", revision: null }],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname === "/api/sync/files/download" &&
              url.searchParams.get("type") === "cover",
            handler: "CacheFirst",
            options: {
              cacheName: "covers-proxy",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\/covers\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "covers-public",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^\/api\/.*/,
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: "Readmaxxing",
        short_name: "Readmaxxing",
        description:
          "AI-assisted ebook reader with multi-pane layout, highlights, notes, and hundreds of free books.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          {
            src: "/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/favicon-32x32.png",
            sizes: "32x32",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/favicon-16x16.png",
            sizes: "16x16",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
    patchIndexHtmlPrecacheRevision(),
  ],
  define: {
    __SITE_ORIGIN__: JSON.stringify(getSiteOrigin()),
  },
});
