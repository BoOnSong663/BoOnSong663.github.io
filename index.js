export default {
  async fetch(request) {
    const url = new URL(request.url);
    let path = url.pathname;

    // จัดการชื่อหน้าให้อัตโนมัติ (เข้าด้วย /admin หรือ /admin.html ก็ได้)
    if (path === '/' || path === '/index' || path === '/customer.html') {
      path = '/index.html';
    } else if (path === '/signup') {
      path = '/signup.html';
    } else if (path === '/admin') {
      path = '/admin.html';
    }

    // ดึงไฟล์ HTML จาก GitHub ตาม Path ที่เรียก
    const githubUrl = `https://raw.githubusercontent.com/BoOnSong663/fitness/main${path}`;
    const res = await fetch(githubUrl);

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
      },
    });
  }
};
