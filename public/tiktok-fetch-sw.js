const PROXY_PATH = '/tiktok-fetch-proxy';
const ALLOWED_HOSTS = ['www.tiktok.com', 'tiktok.com', 'm.tiktok.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function isAllowedTikTokUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' && ALLOWED_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname !== PROXY_PATH) return;

  const target = requestUrl.searchParams.get('url');
  if (!target || !isAllowedTikTokUrl(target)) {
    event.respondWith(new Response('Invalid TikTok URL', { status: 400 }));
    return;
  }

  event.respondWith(
    fetch(target, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'include',
    })
      .then(async (response) => {
        const body = await response.text();
        return new Response(body, {
          status: response.status,
          headers: {
            'Content-Type': response.headers.get('Content-Type') || 'text/plain; charset=utf-8',
          },
        });
      })
      .catch((err) =>
        new Response(JSON.stringify({ error: err.message || 'fetch failed' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        })
      )
  );
});
