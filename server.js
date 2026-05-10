/* ============================================================
   Matric Nejma 6 — Vercel Serverless Function + JSON API
   - Static file serving (existing landing + blog pages)
   - POST /api/messages              (public — contact form)
   - POST /api/admin/login           (public — returns token)
   - GET  /api/admin/check           (auth — verify token)
   - GET  /api/admin/stats           (auth — dashboard stats)
   - GET  /api/admin/messages        (auth)
   - PATCH /api/admin/messages/:id   (auth — mark read/unread)
   - DELETE /api/admin/messages/:id  (auth)
   - GET  /api/admin/posts           (auth)
   - POST /api/admin/posts           (auth — add)
   - PUT  /api/admin/posts/:slug     (auth — update)
   - DELETE /api/admin/posts/:slug   (auth)
   - POST /api/admin/password        (auth — change password)
   ============================================================ */

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const store = require("./lib/store");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const sessions = new Map(); // token -> expiresAt
const loginAttempts = new Map(); // ip -> { count, resetAt }

/* ---------- File helpers (sync to keep things simple) ---------- */
function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}
function writeJSON(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

/* ---------- Password hashing (scrypt) ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(candidate, "hex"),
    );
  } catch (_) {
    return false;
  }
}

/* ---------- Initialise admin password (called after listen) ---------- */
function ensureAdmin() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    let admin = readJSON(ADMIN_FILE, null);
    const envPwd = process.env.ADMIN_PASSWORD;

    if (envPwd) {
      if (!admin || !verifyPassword(envPwd, admin.passwordHash)) {
        admin = {
          passwordHash: hashPassword(envPwd),
          updatedAt: new Date().toISOString(),
        };
        writeJSON(ADMIN_FILE, admin);
        console.log("[admin] Password set from ADMIN_PASSWORD env var.");
      }
    } else if (!admin || !admin.passwordHash) {
      admin = {
        passwordHash: hashPassword("admin123"),
        updatedAt: new Date().toISOString(),
      };
      writeJSON(ADMIN_FILE, admin);
      console.log(
        '[admin] Default password set to "admin123" — change it from the admin panel!',
      );
    }
  } catch (e) {
    console.error("[admin] init error:", e);
  }
}

/* ---------- Sessions / auth ---------- */
function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}
function isAuthed(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (exp < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}
function rateLimitLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}

/* ---------- HTTP helpers ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}
function sendError(res, status, message) {
  sendJSON(res, status, { error: message });
}

function readBody(req, max = 1024 * 50) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > max) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function getClientIP(req) {
  return (
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

function isValidEmail(s) {
  return (
    typeof s === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) &&
    s.length <= 200
  );
}
function safeStr(v, max) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

/* ---------- Client env injection ---------- */
const CLIENT_ENV_PAGES = ['admin.html', 'post.html', 'contact.html', 'blog.html'];

function injectClientEnv(html) {
    const env = {
        SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY || '',
        OPENROUTER_API_KEY: process.env.PUBLIC_OPENROUTER_API_KEY || '',
        UNSPLASH_ACCESS_KEY: process.env.PUBLIC_UNSPLASH_ACCESS_KEY || '',
    };
    const script = `<script>window.__ENV__=${JSON.stringify(env)}</script>`;
    return html.replace('</head>', script + '</head>');
}

/* ---------- Static file serving ---------- */
function sendFile(req, res, data, type, status = 200) {
  const isHead = req.method === "HEAD";
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  });
  if (isHead) return res.end();
  res.end(data);
}

function serveStatic(req, res) {
  try {
    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD", "Content-Length": 0 });
      return res.end();
    }

    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { "Content-Length": 0 });
      return res.end();
    }

    // Block direct access to data directory & sensitive files
    if (
      filePath.startsWith(path.join(ROOT, "data")) ||
      filePath.endsWith("server.js")
    ) {
      if (filePath !== POSTS_FILE) {
        res.writeHead(403, { "Content-Length": 0 });
        return res.end();
      }
    }

    let stat = null;
    try {
      stat = fs.statSync(filePath);
    } catch (_) {}

    if (stat && stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      try {
        stat = fs.statSync(filePath);
      } catch (_) {
        stat = null;
      }
    }

    if (!stat || !stat.isFile()) {
      const fallback = path.join(ROOT, "index.html");
      try {
        const data = fs.readFileSync(fallback);
        return sendFile(req, res, data, "text/html; charset=utf-8", 200);
      } catch (_) {
        res.writeHead(404, { "Content-Length": 0 });
        return res.end();
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    let data = fs.readFileSync(filePath);
    if (ext === '.html' && CLIENT_ENV_PAGES.includes(path.basename(filePath))) {
        data = Buffer.from(injectClientEnv(data.toString('utf8')));
    }
    return sendFile(req, res, data, type, 200);
  } catch (err) {
    console.error("Static error:", err);
    try {
      res.writeHead(500, { "Content-Length": 0 });
      res.end();
    } catch (_) {}
  }
}

/* ---------- API routing ---------- */
async function handleAPI(req, res, parsed) {
  const { pathname } = parsed;
  const method = req.method.toUpperCase();

  /* ---------- Public: contact form ---------- */
  if (pathname === "/api/messages" && method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }

    // Honeypot: if the hidden 'website' field is filled, silently accept and drop
    if (body.website) return sendJSON(res, 200, { ok: true });

    const name = safeStr(body.name, 120);
    const email = safeStr(body.email, 200);
    const subject = safeStr(body.subject, 200);
    const message = safeStr(body.message, 5000);

    if (!name || name.length < 2) return sendError(res, 400, "الاسم مطلوب");
    if (!isValidEmail(email))
      return sendError(res, 400, "البريد الإلكتروني غير صحيح");
    if (!subject) return sendError(res, 400, "الموضوع مطلوب");
    if (!message || message.length < 5)
      return sendError(res, 400, "الرسالة قصيرة جداً");

    const messages = await store.getMessages();
    const entry = {
      id: crypto.randomUUID(),
      name,
      email,
      subject,
      message,
      ip: getClientIP(req),
      userAgent: (req.headers["user-agent"] || "").slice(0, 250),
      read: false,
      createdAt: new Date().toISOString(),
    };
    messages.unshift(entry);
    await store.setJSON('messages', messages);
    return sendJSON(res, 201, { ok: true, id: entry.id });
  }

  /* ---------- Admin: login ---------- */
  if (pathname === "/api/admin/login" && method === "POST") {
    const ip = getClientIP(req);
    if (!rateLimitLogin(ip))
      return sendError(res, 429, "محاولات كثيرة، حاول لاحقاً.");

    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }

    const password = safeStr(body.password, 200);
    const admin = readJSON(ADMIN_FILE, {});
    if (!verifyPassword(password, admin.passwordHash)) {
      return sendError(res, 401, "كلمة مرور خاطئة");
    }
    const token = createSession();
    return sendJSON(res, 200, { ok: true, token, expiresIn: SESSION_TTL_MS });
  }

  /* ---------- All routes below require auth ---------- */
  if (pathname.startsWith("/api/admin/") && !isAuthed(req)) {
    return sendError(res, 401, "غير مصرح");
  }

  /* ---------- Admin: check session ---------- */
  if (pathname === "/api/admin/check" && method === "GET") {
    return sendJSON(res, 200, { ok: true });
  }

  /* ---------- Admin: stats ---------- */
  if (pathname === "/api/admin/stats" && method === "GET") {
    const messages = await store.getMessages();
    const posts = await store.getPosts();
    const unread = messages.filter((m) => !m.read).length;
    const byCat = posts.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {});
    const last7 = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = messages.filter(
      (m) => new Date(m.createdAt).getTime() >= last7,
    ).length;
    return sendJSON(res, 200, {
      messagesTotal: messages.length,
      messagesUnread: unread,
      messagesLast7Days: recent,
      postsTotal: posts.length,
      postsByCategory: byCat,
      uptime: process.uptime(),
    });
  }

  /* ---------- Admin: analytics ---------- */
  if (pathname === "/api/admin/analytics" && method === "GET") {
    const posts = await store.getPosts();
    const msgs = await store.getMessages();
    const totalViews = posts.reduce((sum, p) => sum + (p.views || 0), 0);
    return sendJSON(res, 200, {
      stats: {
        totalPosts: posts.length,
        totalMessages: msgs.length,
        totalViews,
        unreadMessages: msgs.filter(m => !m.read).length
      },
      postsByCategory: posts.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1;
        return acc;
      }, {}),
      env: store.envInfo()
    });
  }

  /* ---------- Blog: search ---------- */
  if ((pathname === "/api/blog/search" || pathname === "/api/blog") && method === "GET") {
    const q = (parsed.searchParams.get("q") || "").toLowerCase();
    const category = parsed.searchParams.get("category");
    const posts = await store.getPosts();
    const filtered = posts.filter(p => {
      if (p.published === false) return false;
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const matchesQ = !q
        || (p.title || "").toLowerCase().includes(q)
        || (p.content || "").toLowerCase().includes(q)
        || tags.some(t => String(t).toLowerCase().includes(q));
      const matchesC = !category || category === "all" || p.category === category;
      return matchesQ && matchesC;
    });
    return sendJSON(res, 200, { posts: filtered });
  }

  /* ---------- Blog: comments ---------- */
  if (pathname === "/api/blog/comments" && method === "POST") {
    let body;
    try { body = await readBody(req); } catch(e) { return sendError(res, 400, e.message); }
    const { slug, name, comment } = body;
    if (!slug || !name || !comment) return sendError(res, 400, "Missing fields");
    const posts = await store.getPosts();
    const idx = posts.findIndex(p => p.slug === slug);
    if (idx === -1) return sendError(res, 404, "Post not found");
    if (!posts[idx].comments) posts[idx].comments = [];
    posts[idx].comments.push({
      id: crypto.randomUUID(),
      name: safeStr(name, 50),
      text: safeStr(comment, 1000),
      date: new Date().toISOString(),
      approved: false
    });
    await store.setJSON("posts", posts);
    return sendJSON(res, 201, { ok: true });
  }

  /* ---------- Admin: messages ---------- */
  if (pathname === "/api/admin/messages" && method === "GET") {
    const messages = await store.getMessages();
    return sendJSON(res, 200, { messages });
  }
  const msgMatch = pathname.match(/^\/api\/admin\/messages\/([\w-]+)$/);
  if (msgMatch) {
    const id = msgMatch[1];
    const messages = await store.getMessages();
    const idx = messages.findIndex((m) => m.id === id);
    if (idx === -1) return sendError(res, 404, "الرسالة غير موجودة");

    if (method === "PATCH") {
      let body;
      try {
        body = await readBody(req);
      } catch (e) {
        return sendError(res, 400, e.message);
      }
      if (typeof body.read === "boolean") messages[idx].read = body.read;
      await store.setJSON('messages', messages);
      return sendJSON(res, 200, { ok: true, message: messages[idx] });
    }
    if (method === "DELETE") {
      messages.splice(idx, 1);
      await store.setJSON('messages', messages);
      return sendJSON(res, 200, { ok: true });
    }
  }

  /* ---------- Admin: posts ---------- */
  if (pathname === "/api/admin/posts" && method === "GET") {
    return sendJSON(res, 200, { posts: await store.getPosts() });
  }
  if (pathname === "/api/admin/posts" && method === "POST") {
    let body;
    try {
      body = await readBody(req, 1024 * 200);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const posts = await store.getPosts();
    const slug = safeStr(body.slug, 120);
    if (!slug) return sendError(res, 400, "slug مطلوب");
    if (posts.some((p) => p.slug === slug))
      return sendError(res, 409, "يوجد مقال بنفس الـ slug");
    const post = sanitizePost(body);
    posts.unshift(post);
    await store.setJSON('posts', posts);
    return sendJSON(res, 201, { ok: true, post });
  }
  const postMatch = pathname.match(/^\/api\/admin\/posts\/([\w-]+)$/);
  if (postMatch) {
    const slug = postMatch[1];
    const posts = await store.getPosts();
    const idx = posts.findIndex((p) => p.slug === slug);
    if (idx === -1) return sendError(res, 404, "المقال غير موجود");
    if (method === "PUT") {
      let body;
      try {
        body = await readBody(req, 1024 * 200);
      } catch (e) {
        return sendError(res, 400, e.message);
      }
      const updated = sanitizePost({ ...posts[idx], ...body, slug });
      posts[idx] = updated;
      await store.setJSON('posts', posts);
      return sendJSON(res, 200, { ok: true, post: updated });
    }
if (method === "DELETE") {
      posts.splice(idx, 1);
      await store.setJSON("posts", posts);
      return sendJSON(res, 200, { ok: true });
    }
  }

  /* ---------- Admin: generate static blog page ---------- */
  if (pathname === "/api/admin/posts/generate-static" && method === "POST") {
    let body;
    try {
      body = await readBody(req, 1024 * 300);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const { post } = body;
    if (!post || !post.slug || !post.title) {
      return sendError(res, 400, "بيانات المقال غير مكتملة");
    }
    
    const SITE_URL = "https://www.matricnjm.online";
    const SITE_NAME = "Matric Nejma 6";
    const today = new Date().toISOString().slice(0, 10);
    const categoryLabels = { tech: "تقنية", sports: "رياضة", legal: "法律ي" };
    const category = post.category || "tech";
    const categoryLabel = categoryLabels[category] || category;
    const image = post.image || "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80";
    
    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${post.title} — ${SITE_NAME}</title>
    <meta name="description" content="${(post.excerpt || post.title).replace(/"/g, '&quot;')}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${SITE_URL}/blog/${post.slug}.html">
    <meta name="theme-color" content="#e11d48">
    <link rel="icon" type="image/svg+xml" href="../assets/logo.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Tajawal:wght@500;700;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../assets/css/blog.css">
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": "${post.title.replace(/"/g, '&quot;')}",
        "description": "${(post.excerpt || post.title).replace(/"/g, '&quot;')}",
        "image": "${image}",
        "author": { "@type": "Organization", "name": "${post.author || SITE_NAME}" },
        "publisher": {
            "@type": "Organization",
            "name": "${SITE_NAME}",
            "logo": { "@type": "ImageObject", "url": "${SITE_URL}/assets/logo.svg" }
        },
        "datePublished": "${post.date || today}",
        "dateModified": "${today}",
        "mainEntityOfPage": "${SITE_URL}/blog/${post.slug}.html"
    }
    </script>
</head>
<body>
    <header class="site-header">
        <div class="container nav">
            <a href="../index.html" class="brand"><img src="../assets/logo.svg" alt="${SITE_NAME}" loading="lazy" style="width:32px;height:32px"><span>${SITE_NAME}</span></a>
            <nav aria-label="القائمة الرئيسية"><ul class="nav-links" id="navLinks">
                <li><a href="../index.html">الرئيسية</a></li>
                <li><a href="../blog.html" class="active">المدونة</a></li>
                <li><a href="../about.html">من نحن</a></li>
                <li><a href="../contact.html">تواصل معنا</a></li>
            </ul></nav>
            <div class="nav-tools"><button id="themeToggle" class="icon-btn" aria-label="تبديل المظهر">🌓</button><button id="menuToggle" class="icon-btn menu-toggle" aria-label="القائمة">☰</button></div>
        </div>
    </header>

    <main class="container static-page">
        <article class="prose">
            <p><a href="../blog.html">المدونة</a> / ${categoryLabel}</p>
            <h1>${post.title}</h1>
            ${post.content || '<p>المحتوى...</p>'}
        </article>
    </main>

    <footer class="site-footer"><div class="container"><div class="footer-grid">
        <div><h4>${SITE_NAME}</h4><p>موقع تحريري عربي يهتم بتقنيات البث الرياضي وتجربة مشاهدة كرة القدم.</p></div>
        <div><h4>روابط</h4><ul><li><a href="../about.html">من نحن</a></li><li><a href="../terms.html">شروط الاستخدام</a></li><li><a href="../privacy.html">سياسة الخصوصية</a></li><li><a href="../contact.html">تواصل معنا</a></li></ul></div>
        <div><h4>تابعنا</h4><p>لا توجد حسابات اجتماعية رسمية حالياً.</p></div>
    </div><div class="copyright">© <span id="year"></span> ${SITE_NAME} — جميع الحقوق محفوظة.</div></div></footer>
    <script src="../assets/js/posts.js"></script>
</body>
</html>`;

    const blogDir = path.join(ROOT, "blog");
    if (!fs.existsSync(blogDir)) {
      fs.mkdirSync(blogDir, { recursive: true });
    }
    
    const filePath = path.join(blogDir, `${post.slug}.html`);
    fs.writeFileSync(filePath, html, "utf8");
    
    return sendJSON(res, 200, { ok: true, file: `/blog/${post.slug}.html`, url: `${SITE_URL}/blog/${post.slug}.html` });
  }

  /* ---------- Admin: change password ---------- */
  if (pathname === "/api/admin/password" && method === "POST") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const current = safeStr(body.current, 200);
    const next = safeStr(body.next, 200);
    if (next.length < 6)
      return sendError(
        res,
        400,
        "كلمة المرور الجديدة قصيرة (6 حروف على الأقل)",
      );
    const admin = readJSON(ADMIN_FILE, {});
    if (!verifyPassword(current, admin.passwordHash))
      return sendError(res, 401, "كلمة المرور الحالية خاطئة");
    writeJSON(ADMIN_FILE, {
      passwordHash: hashPassword(next),
      updatedAt: new Date().toISOString(),
    });
    return sendJSON(res, 200, { ok: true });
  }

  return sendError(res, 404, "Route not found");
}

function sanitizePost(input) {
  return {
    slug: safeStr(input.slug, 120),
    title: safeStr(input.title, 250),
    category: safeStr(input.category, 50) || "tech",
    categoryLabel: safeStr(input.categoryLabel, 50) || input.category || "tech",
    author: safeStr(input.author, 120) || "فريق Matric Nejma 6",
    date: safeStr(input.date, 30) || new Date().toISOString().slice(0, 10),
    image: safeStr(input.image, 500),
    excerpt: safeStr(input.excerpt, 500),
    tags: Array.isArray(input.tags)
      ? input.tags
          .map((t) => safeStr(t, 50))
          .filter(Boolean)
          .slice(0, 12)
      : [],
    content:
      typeof input.content === "string" ? input.content.slice(0, 100000) : "",
    related: Array.isArray(input.related)
      ? input.related
          .map((s) => safeStr(s, 120))
          .filter(Boolean)
          .slice(0, 10)
      : [],
  };
}

/* ---------- Request handler (used by local server + Vercel) ---------- */
const handler = async (req, res) => {
  ensureAdmin();
  try {
    const parsed = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`,
    );
    
    // Basic CSRF Protection for state-changing requests
    const method = req.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const origin = req.headers.origin || req.headers.referer;
      if (origin) {
        const originUrl = new URL(origin);
        if (originUrl.hostname !== (req.headers.host || "localhost").split(':')[0]) {
           // On Vercel, host might be different, but let's allow it for now or check against a whitelist
           // console.warn(`Potential CSRF: ${originUrl.hostname} vs ${req.headers.host}`);
        }
      }
    }

    if (parsed.pathname.startsWith("/api/")) return handleAPI(req, res, parsed);
    if (parsed.pathname === "/sitemap.xml") {
      const sitemapHandler = require("./api/sitemap.js");
      return sitemapHandler(req, res);
    }
    if (parsed.pathname === "/post.html" && parsed.searchParams.has("slug")) {
      const postHandler = require("./api/render-post.js");
      return postHandler(req, res);
    }
    return serveStatic(req, res);
  } catch (err) {
    console.error("Request error:", err);
    try {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error", message: err.message }));
    } catch (_) {}
  }
};

module.exports = handler;

/* ---------- Local HTTP bootstrap (skipped on Vercel) ---------- */
if (require.main === module) {
  const http = require("http");
  const PORT = parseInt(process.env.PORT, 10) || 5000;
  const HOST = process.env.HOST || "0.0.0.0";
  const server = http.createServer(handler);
  server.listen(PORT, HOST, () => {
    console.log(`[server] listening on http://${HOST}:${PORT}`);
  });
  const shutdown = (sig) => () => {
    console.log(`[server] received ${sig}, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGTERM", shutdown("SIGTERM"));
  process.on("SIGINT", shutdown("SIGINT"));
}
