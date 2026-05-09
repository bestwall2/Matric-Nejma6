const fs = require("fs");
const path = require("path");

const SITE_URL = "https://matricnjm.online";
const POSTS_FILE = path.join(__dirname, "..", "data", "posts.json");

const STATIC_PAGES = [
  { loc: "/", priority: 1.0, changefreq: "weekly" },
  { loc: "/blog.html", priority: 0.9, changefreq: "weekly" },
  { loc: "/contact.html", priority: 0.5, changefreq: "monthly" },
  { loc: "/privacy.html", priority: 0.3, changefreq: "monthly" },
];

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

module.exports = async (req, res) => {
  try {
    let posts = [];
    try {
      const raw = fs.readFileSync(POSTS_FILE, "utf8");
      posts = JSON.parse(raw);
    } catch (_) {}

    const today = new Date().toISOString().slice(0, 10);

    const urls = [...STATIC_PAGES];

    for (const post of posts) {
      urls.push({
        loc: `/post.html?slug=${encodeURIComponent(post.slug)}`,
        priority: 0.8,
        changefreq: "monthly",
        lastmod: post.date || today,
      });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${SITE_URL}${u.loc}</loc>
    <priority>${u.priority}</priority>
    <changefreq>${u.changefreq}</changefreq>
    ${u.lastmod ? `<lastmod>${escapeXml(u.lastmod)}</lastmod>` : ""}
  </url>`
  )
  .join("\n")}
</urlset>`;

    res.writeHead(200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Length": Buffer.byteLength(xml),
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    });
    res.end(xml);
  } catch (err) {
    console.error("Sitemap error:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
};
