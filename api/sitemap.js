const SITE_URL = "https://www.matricnjm.online";

const STATIC_PAGES = [
  { loc: "/", priority: 1.0, changefreq: "weekly" },
  { loc: "/blog.html", priority: 0.9, changefreq: "weekly" },
  { loc: "/blog/matric-nejma6-watch-guide-2026.html", priority: 0.9, changefreq: "monthly" },
  { loc: "/blog/world-cup-2026-where-to-watch-4k.html", priority: 0.8, changefreq: "monthly" },
  { loc: "/blog/best-streaming-apps-2026.html", priority: 0.8, changefreq: "monthly" },
  { loc: "/blog/watch-football-legally-online.html", priority: 0.8, changefreq: "monthly" },
  { loc: "/about.html", priority: 0.6, changefreq: "monthly" },
  { loc: "/contact.html", priority: 0.5, changefreq: "monthly" },
  { loc: "/privacy.html", priority: 0.3, changefreq: "monthly" },
  { loc: "/terms.html", priority: 0.3, changefreq: "monthly" },
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
