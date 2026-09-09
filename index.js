export default {
  async fetch(request) {
    const url = new URL(request.url);
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
