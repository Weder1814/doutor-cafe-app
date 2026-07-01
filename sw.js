var CACHE_NAME = 'doutor-cafe-v2';
var URLS_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  // Não interceptar chamadas à API
  if (event.request.url.includes('railway.app') ||
      event.request.url.includes('anthropic.com') ||
      event.request.url.includes('mercadopago.com')) {
    return;
  }

  // Navegação/HTML (o "app shell"): NETWORK-FIRST.
  // Sempre tenta buscar a versão mais nova primeiro; só usa cache
  // como fallback se estiver offline. Isso garante que toda
  // atualização feita no deploy chegue no usuário na próxima
  // abertura do app com internet, sem precisar limpar cache manual.
  if (event.request.mode === 'navigate' ||
      event.request.url.endsWith('/index.html') ||
      event.request.url.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(function() {
          // Sem internet: usa a última versão salva em cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // Demais assets estáticos (manifest, ícones, etc.): cache-first
  // com atualização em segundo plano (stale-while-revalidate).
  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      var fetchPromise = fetch(event.request).then(function(networkResponse) {
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(function() {
        return cachedResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});
