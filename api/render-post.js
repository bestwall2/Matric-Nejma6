const fs = require("fs");
const path = require("path");
const { getPosts } = require("../lib/store");

const SITE_URL = "https://www.matricnjm.online";
const SITE_NAME = "Matric Nejma 6";
const POST_TEMPLATE = path.join(__dirname, "..", "post.html");

const LOGO_URL = `${SITE_URL}/assets/logo.png`;

function safeStr(v, max) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildMetaTags(post) {
  const title = escapeHtml(`${post.title} — ${SITE_NAME}`);
  const description = escapeHtml(post.excerpt || "");
  const canonical = `${SITE_URL}/post.html?slug=${encodeURIComponent(post.slug)}`;
  const imageUrl = post.image || LOGO_URL;
  const tags = Array.isArray(post.tags) ? post.tags.join(", ") : "";

  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: [post.image || LOGO_URL],
    author: { "@type": "Person", name: post.author || SITE_NAME },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: LOGO_URL },
    },
    datePublished: post.date,
    dateModified: post.date,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    articleSection: post.categoryLabel || post.category,
    keywords: tags,
  };

  return {
    title,
    description,
    canonical,
    keywords: tags,
    og: [
      '<meta property="og:type" content="article">',
      '<meta property="og:url" content="' + canonical + '">',
      '<meta property="og:title" content="' + title + '">',
      '<meta property="og:description" content="' + description + '">',
      '<meta property="og:image" content="' + imageUrl + '">',
      '<meta property="og:site_name" content="' + SITE_NAME + '">',
      post.date ? '<meta property="article:published_time" content="' + escapeHtml(post.date) + '">' : "",
      post.date ? '<meta property="article:modified_time" content="' + escapeHtml(post.date) + '">' : "",
      post.category ? '<meta property="article:section" content="' + escapeHtml(post.categoryLabel || post.category) + '">' : "",
    ].filter(Boolean).join("\n    "),
    twitter: [
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="twitter:url" content="' + canonical + '">',
      '<meta name="twitter:title" content="' + title + '">',
      '<meta name="twitter:description" content="' + description + '">',
      '<meta name="twitter:image" content="' + imageUrl + '">',
    ].join("\n    "),
    jsonld: '<script type="application/ld+json">\n    ' + JSON.stringify(schema, null, 2) + '\n    </script>',
  };
}

function injectIntoHtml(template, meta) {
  return template
    .replace(/<!--META_TITLE-->.*?<!--\/META_TITLE-->/s, meta.title)
    .replace(/<!--META_DESCRIPTION-->.*?<!--\/META_DESCRIPTION-->/s, meta.description)
    .replace(/<!--META_KEYWORDS-->.*?<!--\/META_KEYWORDS-->/s, meta.keywords)
    .replace(/<!--META_CANONICAL-->.*?<!--\/META_CANONICAL-->/s, meta.canonical)
    .replace("<!--META_OG-->", meta.og)
    .replace("<!--META_TWITTER-->", meta.twitter)
    .replace("<!--META_JSONLD-->", meta.jsonld);
}

module.exports = async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const slug = parsedUrl.searchParams.get("slug");

    if (!slug) {
      return serveStaticPost(res);
    }

    let posts;
    try {
      posts = await getPosts();
    } catch (_) {
      return serveStaticPost(res);
    }

    const post = posts.find((p) => p.slug === slug);
    if (!post) {
      return serveStaticPost(res);
    }

    let template;
    try {
      template = fs.readFileSync(POST_TEMPLATE, "utf8");
    } catch (_) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end("Template not found");
    }

    const meta = buildMetaTags(post);
    const html = injectIntoHtml(template, meta);

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html),
      "Cache-Control": "public, max-age=300, s-maxage=300",
    });
    res.end(html);
  } catch (err) {
    console.error("Render-post error:", err);
    serveStaticPost(res);
  }
};

function serveStaticPost(res) {
  try {
    let data = fs.readFileSync(POST_TEMPLATE, "utf8");
    // Add noindex to prevent indexing of slug-less template page
    data = data.replace(
      "</title>",
      '</title>\n    <meta name="robots" content="noindex, nofollow">'
    );
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(data),
      "Cache-Control": "noindex, nofollow",
    });
    res.end(data);
  } catch (_) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}
