var CACHE_NAME = 'doutor-cafe-v3';
var TIMEOUT_REDE_MS = 4000;
var URLS_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/cafe.jpeg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // addAll falha tudo se 1 arquivo faltar (ex: icon-512.png com nome diferente).
      // Usamos add() individual com catch pra não quebrar o cache inteiro por causa
      // de um arquivo opcional que não existe no seu deploy.
      return Promise.all(
        URLS_CACHE.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.log('[SW] Não foi possível cachear:', url, err);
          });
        })
      );
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

// Busca na rede com prazo máximo — se não responder a tempo (sinal fraco no
// campo), cai pro cache em vez de deixar o usuário esperando indefinidamente.
function fetchComTimeout(request, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() { reject(new Error('timeout')); }, timeoutMs);
    fetch(request).then(function(response) {
      clearTimeout(timer);
      resolve(response);
    }).catch(function(err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

self.addEventListener('fetch', function(event) {
  // Não interceptar chamadas à API
  if (event.request.url.includes('railway.app') ||
      event.request.url.includes('anthropic.com') ||
      event.request.url.includes('mercadopago.com')) {
    return;
  }

  // Navegação/HTML (o "app shell"): NETWORK-FIRST com timeout.
  // Sempre tenta buscar a versão mais nova primeiro; só usa cache
  // como fallback se estiver offline OU se a rede demorar demais
  // (comum em área rural com sinal fraco). Isso garante que toda
  // atualização feita no deploy chegue no usuário na próxima
  // abertura do app com internet, sem travar a tela de espera.
  if (event.request.mode === 'navigate' ||
      event.request.url.endsWith('/index.html') ||
      event.request.url.endsWith('/')) {
    event.respondWith(
      fetchComTimeout(event.request, TIMEOUT_REDE_MS)
        .then(function(response) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(function() {
          // Sem internet ou rede lenta demais: usa a última versão salva em cache
          return caches.match(event.request).then(function(cached) {
            return cached || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Demais assets estáticos (manifest, ícones, imagens, etc.): cache-first
  // com atualização em segundo plano (stale-while-revalidate). Aqui não usamos
  // timeout porque, havendo cache, a resposta já é instantânea; a rede só
  // atualiza o cache silenciosamente para a próxima vez.
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
