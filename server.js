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

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

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
      admin = {
        passwordHash: hashPassword(envPwd),
        updatedAt: new Date().toISOString(),
      };
      writeJSON(ADMIN_FILE, admin);
      console.log("[admin] Password set from ADMIN_PASSWORD env var.");
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
    const data = fs.readFileSync(filePath);
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

    const messages = readJSON(MESSAGES_FILE, []);
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
    writeJSON(MESSAGES_FILE, messages);
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
    const messages = readJSON(MESSAGES_FILE, []);
    const posts = readJSON(POSTS_FILE, []);
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

  /* ---------- Admin: messages ---------- */
  if (pathname === "/api/admin/messages" && method === "GET") {
    const messages = readJSON(MESSAGES_FILE, []);
    return sendJSON(res, 200, { messages });
  }
  const msgMatch = pathname.match(/^\/api\/admin\/messages\/([\w-]+)$/);
  if (msgMatch) {
    const id = msgMatch[1];
    const messages = readJSON(MESSAGES_FILE, []);
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
      writeJSON(MESSAGES_FILE, messages);
      return sendJSON(res, 200, { ok: true, message: messages[idx] });
    }
    if (method === "DELETE") {
      messages.splice(idx, 1);
      writeJSON(MESSAGES_FILE, messages);
      return sendJSON(res, 200, { ok: true });
    }
  }

  /* ---------- Admin: posts ---------- */
  if (pathname === "/api/admin/posts" && method === "GET") {
    return sendJSON(res, 200, { posts: readJSON(POSTS_FILE, []) });
  }
  if (pathname === "/api/admin/posts" && method === "POST") {
    let body;
    try {
      body = await readBody(req, 1024 * 200);
    } catch (e) {
      return sendError(res, 400, e.message);
    }
    const posts = readJSON(POSTS_FILE, []);
    const slug = safeStr(body.slug, 120);
    if (!slug) return sendError(res, 400, "slug مطلوب");
    if (posts.some((p) => p.slug === slug))
      return sendError(res, 409, "يوجد مقال بنفس الـ slug");
    const post = sanitizePost(body);
    posts.unshift(post);
    writeJSON(POSTS_FILE, posts);
    return sendJSON(res, 201, { ok: true, post });
  }
  const postMatch = pathname.match(/^\/api\/admin\/posts\/([\w-]+)$/);
  if (postMatch) {
    const slug = postMatch[1];
    const posts = readJSON(POSTS_FILE, []);
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
      writeJSON(POSTS_FILE, posts);
      return sendJSON(res, 200, { ok: true, post: updated });
    }
    if (method === "DELETE") {
      posts.splice(idx, 1);
      writeJSON(POSTS_FILE, posts);
      return sendJSON(res, 200, { ok: true });
    }
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
    if (parsed.pathname.startsWith("/api/")) return handleAPI(req, res, parsed);
    return serveStatic(req, res);
  } catch (err) {
    console.error("Request error:", err);
    try {
      res.writeHead(500);
      res.end("Internal Server Error");
    } catch (_) {}
  }
};

module.exports = handler;

/* ---------- Local HTTP bootstrap (skipped on Vercel) ---------- */
if (require.main === module) {
  const http = require("http");
  const PORT = parseInt(process.env.PORT, 10) || 5000;
  const HOST = "0.0.0.0";
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
