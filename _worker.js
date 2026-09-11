// ==================== การตั้งค่า ====================
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwetSgXYlfCuKE7wj7WtryWxhB-MADsZ5rj_3wpUpbeoX6vw9zpgmma3EmRHc9i4TZe/exec";

const CACHEABLE_ACTIONS = new Set([
  'getFaculties', 'getPublicPrices', 'getMonthlyPrices', 'getPublicQuotas', 'getBankInfo'
]);

const CACHE_TTL_SECONDS = 300; // cache 5 นาที

// ==================== Worker หลัก ====================
export default {
  async fetch(request, env, ctx) {   // ← เพิ่ม env, ctx ตรงนี้
    const url = new URL(request.url);

    if (url.pathname === '/api/gas' && request.method === 'POST') {
      return handleGasProxy(request, ctx);
    }

    let path = url.pathname;

    // จัดการชื่อหน้าให้อัตโนมัติ
    if (path === '/' || path === '/index' || path === '/customer.html') {
      path = '/index.html';
    } else if (path === '/signup') {
      path = '/signup.html';
    } else if (path === '/admin') {
      path = '/admin.html';
    }

    // ลิงก์ดึงไฟล์จาก GitHub Repo: BoOnSong663.github.io พร้อม Cloudflare Edge Cache
    const githubUrl = `https://raw.githubusercontent.com/BoOnSong663/BoOnSong663.github.io/main${path}`;
    const res = await fetch(githubUrl, {
      cf: {
        cacheTtl: 120,
        cacheEverything: true
      }
    });

    if (!res.ok) {
      return new Response(`ไม่พบหน้านี้ (404 Not Found): ${path}`, {
        status: 404,
        headers: { "content-type": "text/html;charset=UTF-8" }
      });
    }

    const html = await res.text();
    return new Response(html, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "cache-control": "public, max-age=60, s-maxage=120",
      },
    });
  }
};

// ==================== Proxy สำหรับเรียก Google Apps Script ====================
async function handleGasProxy(request, ctx) {
  let body;
  try { body = await request.json(); }
  catch (e) {
    return new Response(JSON.stringify({ status: 'error', message: 'invalid json' }), {
      status: 400, headers: { 'content-type': 'application/json' }
    });
  }

  const isCacheable = CACHEABLE_ACTIONS.has(body.action);
  const cache = caches.default;
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.set('action', body.action);
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });

  if (isCacheable) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let gasRes;
  try {
    gasRes = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    return new Response(JSON.stringify({ status: 'error', message: 'GAS unreachable: ' + err.message }), {
      status: 502, headers: { 'content-type': 'application/json' }
    });
  }
  clearTimeout(timer);

  const text = await gasRes.text();
  const response = new Response(text, {
    status: gasRes.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': isCacheable ? `public, max-age=${CACHE_TTL_SECONDS}` : 'no-store'
    }
  });

  if (isCacheable && gasRes.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
