/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, prerendered, version } from "$service-worker";

const CACHE_NAME = `cache-${version}`;
// prerendered is empty today (CSR-only app) but included for future-proofing.
// "/index.html" is the adapter-static SPA fallback — it is NOT in build/files/
// prerendered, and the navigation fallback below depends on it being cached.
const ASSETS = [...build, ...files, ...prerendered, "/index.html"];

self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.hostname.includes("supabase")) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(async () => {
      if (event.request.mode === "navigate") {
        const shell = await caches.match("/index.html");
        if (shell) return shell;
      }
      return new Response("Offline", { status: 503 });
    })
  );
});
