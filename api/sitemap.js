const { getPosts } = require("../lib/store");

const SITE_URL = "https://www.matricnjm.online";

const STATIC_PAGES = [
  { loc: "/", priority: 1.0, changefreq: "weekly" },
  { loc: "/blog.html", priority: 0.9, changefreq: "weekly" },
  { loc: "/about.html", priority: 0.6, changefreq: "monthly" },
  { loc: "/contact.html", priority: 0.5, changefreq: "monthly" },
  { loc: "/privacy.html", priority: 0.3, changefreq: "monthly" },
  { loc: "/terms.html", priority: 0.3, changefreq: "monthly" },
];

const BLOG_POST_PREFIXES = [
  "matric-nejma6-watch-guide-2026",
  "world-cup-2026-where-to-watch-4k",
  "best-streaming-apps-2026",
  "watch-football-legally-online",
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
    const urls = [...STATIC_PAGES];

    // Add static blog posts
    for (const slug of BLOG_POST_PREFIXES) {
      urls.push({
        loc: `/blog/${slug}.html`,
        priority: 0.9,
        changefreq: "monthly",
      });
    }

    // Add dynamic blog posts from the database
    try {
      const posts = await getPosts();
      for (const post of posts) {
        urls.push({
          loc: `/blog/${post.slug}.html`,
          priority: 0.8,
          changefreq: "monthly",
          lastmod: post.date || post.updated_at,
        });
      }
    } catch (_) {
      // fallback — static only
    }

    // Deduplicate by loc
    const seen = new Set();
    const unique = [];
    for (const u of urls) {
      if (!seen.has(u.loc)) {
        seen.add(u.loc);
        unique.push(u);
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${unique
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
