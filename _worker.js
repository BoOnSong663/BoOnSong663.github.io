// ==================== การตั้งค่า ====================
// URL ของ Google Apps Script อ่านจาก env.GAS_API_URL (ตั้งใน wrangler.toml หรือ Dashboard)

const CACHEABLE_ACTIONS = new Set([
  'getFaculties', 'getPublicPrices', 'getMonthlyPrices', 'getPublicQuotas', 'getBankInfo'
]);

const CACHE_TTL_SECONDS = 300; // cache 5 นาที

// action ที่แก้ไขข้อมูล -> ต้องล้างแคชของ action อ่านตัวไหนบ้าง
const CACHE_INVALIDATION_MAP = {
  'updatePrices': ['getPublicPrices', 'getMonthlyPrices'],
  'updateMemberQuotas': ['getPublicQuotas'],
  'updateBankInfo': ['getBankInfo'],
  'saveFaculties': ['getFaculties']
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

// ==================== Worker หลัก ====================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/gas' && request.method === 'POST') {
      return handleGasProxy(request, env, ctx);
    }

    let path = url.pathname;
    if (path === '/' || path === '/index' || path === '/customer.html') path = '/index.html';
    else if (path === '/signup') path = '/signup.html';
    else if (path === '/admin') path = '/admin.html';

    const githubUrl = `https://raw.githubusercontent.com/BoOnSong663/BoOnSong663.github.io/main${path}`;
    const res = await fetch(githubUrl, { cf: { cacheTtl: 120, cacheEverything: true } });

    if (!res.ok) {
      return new Response(`ไม่พบหน้านี้ (404 Not Found): ${path}`, {
        status: 404,
        headers: { 'content-type': 'text/html;charset=UTF-8' }
      });
    }

    const html = await res.text();
    return new Response(html, {
      headers: {
        'content-type': 'text/html;charset=UTF-8',
        'cache-control': 'public, max-age=60, s-maxage=120'
      }
    });
  }
};

// ==================== Proxy สำหรับเรียก Google Apps Script ====================
async function handleGasProxy(request, env, ctx) {
  const gasUrl = env.GAS_API_URL;
  if (!gasUrl) {
    return json({ status: 'error', message: 'ยังไม่ได้ตั้งค่า GAS_API_URL ใน Worker' }, 500);
  }

  let body;
  try { body = await request.json(); }
  catch (e) { return json({ status: 'error', message: 'invalid json' }, 400); }

  const isCacheable = CACHEABLE_ACTIONS.has(body.action);
  const cache = caches.default;
  const cacheKeyFor = action => {
    const u = new URL(request.url);
    u.searchParams.set('action', action);
    return new Request(u.toString(), { method: 'GET' });
  };

  if (isCacheable) {
    const cached = await cache.match(cacheKeyFor(body.action));
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let gasRes;
  try {
    gasRes = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    return json({
      status: 'error',
      message: err.name === 'AbortError'
        ? 'เชื่อมต่อช้าเกินไป กรุณาลองใหม่อีกครั้ง'
        : 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองใหม่'
    }, 502);
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
    ctx.waitUntil(cache.put(cacheKeyFor(body.action), response.clone()));
  }

  const toInvalidate = CACHE_INVALIDATION_MAP[body.action];
  if (toInvalidate && gasRes.ok) {
    ctx.waitUntil(Promise.all(toInvalidate.map(a => cache.delete(cacheKeyFor(a)))));
  }

  return response;
}
