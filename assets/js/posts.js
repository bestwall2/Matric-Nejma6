/* ===========================================================
   Matric Nejma 6 — Blog Engine (Vanilla JS)
   - On blog.html : renders the post grid + search + filters
   - On post.html : loads single article by ?slug=, builds
                    Reading time + Table of Contents + Related
                    + JSON-LD Article schema
   =========================================================== */

const POSTS_URL = 'data/posts.json';
const SITE_NAME = 'Matric Nejma 6';
const SITE_URL = 'https://matricnjm.online';

/* ---------- Utilities ---------- */
const fmtDate = (iso) => {
    try {
        return new Date(iso).toLocaleDateString('ar-MA', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    } catch (_) { return iso; }
};

const estimateReadingTime = (html) => {
    const text = html.replace(/<[^>]+>/g, ' ');
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.round(words / 200));
    return minutes;
};

const slugify = (str) => str
    .toString().trim().toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

const getQueryParam = (key) => new URLSearchParams(window.location.search).get(key);

const fetchPosts = async () => {
    const res = await fetch(POSTS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load posts');
    return res.json();
};

/* ===========================================================
   PAGE: Blog Hub (blog.html)
   =========================================================== */
async function initHub() {
    const grid = document.getElementById('postsGrid');
    if (!grid) return;

    const search = document.getElementById('searchInput');
    const chips = document.querySelectorAll('[data-chip]');
    const counter = document.getElementById('postsCount');

    let posts = [];
    let activeCat = 'all';
    let query = '';

    try {
        posts = await fetchPosts();
    } catch (err) {
        grid.innerHTML = `<div class="empty-state"><strong>تعذّر تحميل المقالات</strong>حاول تحديث الصفحة لاحقاً.</div>`;
        console.error(err);
        return;
    }

    const render = () => {
        const q = query.trim().toLowerCase();
        const filtered = posts.filter(p => {
            const matchesCat = activeCat === 'all' || p.category === activeCat;
            const matchesQ = !q
                || p.title.toLowerCase().includes(q)
                || p.excerpt.toLowerCase().includes(q)
                || (p.tags || []).some(t => t.toLowerCase().includes(q));
            return matchesCat && matchesQ;
        });

        if (counter) counter.textContent = `${filtered.length} مقال`;

        if (!filtered.length) {
            grid.innerHTML = `<div class="empty-state"><strong>لا توجد نتائج</strong>جرّب كلمة بحث أخرى أو غيّر التصنيف.</div>`;
            return;
        }

        const cards = filtered.map((p, idx) => `
            <article class="post-card">
                <a href="post.html?slug=${encodeURIComponent(p.slug)}" class="post-thumb" aria-label="${p.title}">
                    <span class="cat-badge" data-cat="${p.category}">${p.categoryLabel || p.category}</span>
                    <img src="${p.image}" alt="${p.title}" loading="lazy" />
                </a>
                <div class="post-body">
                    <h3 class="post-title">
                        <a href="post.html?slug=${encodeURIComponent(p.slug)}" style="color:inherit">${p.title}</a>
                    </h3>
                    <p class="post-excerpt">${p.excerpt}</p>
                    <div class="post-meta">
                        <span>${fmtDate(p.date)}</span>
                        <span>${estimateReadingTime(p.content)} د قراءة</span>
                    </div>
                </div>
            </article>
        `);

        /* In-feed Ad slot inserted after the 3rd card (commented placeholder) */
        if (cards.length >= 3) {
            cards.splice(3, 0, `
                <!-- ============================================================
                     Google AdSense — In-feed ad slot
                     Replace the placeholder below with your real <ins> tag once
                     your AdSense account is approved.
                     ============================================================
                <ins class="adsbygoogle"
                     style="display:block"
                     data-ad-format="fluid"
                     data-ad-layout-key="-XX+XX-XX+XX"
                     data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                     data-ad-slot="XXXXXXXXXX"></ins>
                <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
                -->
                <div class="ad-slot" aria-label="مساحة إعلانية">مساحة إعلان (In-feed)</div>
            `);
        }

        grid.innerHTML = cards.join('');
    };

    /* Search */
    if (search) {
        search.addEventListener('input', (e) => {
            query = e.target.value;
            render();
        });
    }

    /* Category chips */
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            activeCat = chip.dataset.chip;
            render();
        });
    });

    render();
}

/* ===========================================================
   PAGE: Single Article (post.html)
   =========================================================== */
async function initPost() {
    const article = document.getElementById('articleRoot');
    if (!article) return;

    const slug = getQueryParam('slug');
    if (!slug) {
        article.innerHTML = `<div class="empty-state"><strong>مقال غير محدد</strong>الرجاء العودة إلى <a href="blog.html">المدونة</a>.</div>`;
        return;
    }

    let posts;
    try { posts = await fetchPosts(); }
    catch (err) {
        article.innerHTML = `<div class="empty-state"><strong>تعذّر تحميل المقال</strong></div>`;
        console.error(err);
        return;
    }

    const post = posts.find(p => p.slug === slug);
    if (!post) {
        article.innerHTML = `<div class="empty-state"><strong>المقال غير موجود</strong>عُد إلى <a href="blog.html">قائمة المقالات</a>.</div>`;
        return;
    }

    const readingTime = estimateReadingTime(post.content);

    /* Render the article shell */
    article.innerHTML = `
        <div class="article-hero">
            <div class="container">
                <nav class="crumbs" aria-label="breadcrumb">
                    <a href="index.html">الرئيسية</a> /
                    <a href="blog.html">المدونة</a> /
                    <span>${post.categoryLabel || post.category}</span>
                </nav>
                <h1 class="article-title">${post.title}</h1>
                <div class="article-meta">
                    <span>بقلم <strong>${post.author}</strong></span>
                    <span class="dot-sep"></span>
                    <span>${fmtDate(post.date)}</span>
                    <span class="dot-sep"></span>
                    <span>⏱ ${readingTime} دقائق قراءة</span>
                </div>
                <img class="article-cover" src="${post.image}" alt="${post.title}" />
            </div>
        </div>

        <div class="container">
            <div class="article-layout">
                <aside class="toc" aria-label="جدول المحتويات">
                    <h3>📑 جدول المحتويات</h3>
                    <ol id="tocList"></ol>
                </aside>

                <div>
                    <!-- ============================================================
                         Google AdSense — In-article ad (top)
                         Replace the placeholder below with your real <ins> tag.
                         ============================================================
                    <ins class="adsbygoogle"
                         style="display:block; text-align:center;"
                         data-ad-layout="in-article"
                         data-ad-format="fluid"
                         data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
                         data-ad-slot="XXXXXXXXXX"></ins>
                    <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
                    -->
                    <div class="ad-slot" style="margin-bottom:1.4rem">مساحة إعلان (In-article)</div>

                    <div class="prose" id="proseContent">${post.content}</div>

                    <!-- ============================================================
                         Google AdSense — In-article ad (bottom)
                         ============================================================ -->
                    <div class="ad-slot" style="margin-top:1.4rem">مساحة إعلان (In-article)</div>
                </div>
            </div>

            <section class="related">
                <h2>📰 مقالات ذات صلة</h2>
                <div class="posts-grid" id="relatedGrid"></div>
            </section>
        </div>
    `;

    /* Update document head */
    document.title = `${post.title} — ${SITE_NAME}`;
    setMeta('description', post.excerpt);

    /* Build Table of Contents */
    buildTOC();

    /* Build Related posts */
    buildRelated(post, posts);

    /* JSON-LD Article schema */
    injectArticleSchema(post, readingTime);
}

function buildTOC() {
    const prose = document.getElementById('proseContent');
    const tocList = document.getElementById('tocList');
    if (!prose || !tocList) return;

    const headings = prose.querySelectorAll('h2, h3');
    if (!headings.length) {
        tocList.parentElement.style.display = 'none';
        return;
    }

    const items = [];
    headings.forEach((h, i) => {
        const id = h.id || `${slugify(h.textContent)}-${i}`;
        h.id = id;
        const lvl = h.tagName === 'H3' ? 3 : 2;
        items.push(`<li class="lvl-${lvl}"><a href="#${id}">${h.textContent}</a></li>`);
    });
    tocList.innerHTML = items.join('');
}

function buildRelated(currentPost, allPosts) {
    const grid = document.getElementById('relatedGrid');
    if (!grid) return;

    let related = [];
    if (Array.isArray(currentPost.related) && currentPost.related.length) {
        related = currentPost.related
            .map(slug => allPosts.find(p => p.slug === slug))
            .filter(Boolean);
    }
    /* Fallback: same category, exclude self */
    if (!related.length) {
        related = allPosts
            .filter(p => p.category === currentPost.category && p.slug !== currentPost.slug)
            .slice(0, 3);
    }
    if (!related.length) {
        grid.parentElement.style.display = 'none';
        return;
    }

    grid.innerHTML = related.map(p => `
        <article class="post-card">
            <a href="post.html?slug=${encodeURIComponent(p.slug)}" class="post-thumb">
                <span class="cat-badge" data-cat="${p.category}">${p.categoryLabel || p.category}</span>
                <img src="${p.image}" alt="${p.title}" loading="lazy" />
            </a>
            <div class="post-body">
                <h3 class="post-title">
                    <a href="post.html?slug=${encodeURIComponent(p.slug)}" style="color:inherit">${p.title}</a>
                </h3>
                <p class="post-excerpt">${p.excerpt}</p>
                <div class="post-meta">
                    <span>${fmtDate(p.date)}</span>
                    <span>${estimateReadingTime(p.content)} د قراءة</span>
                </div>
            </div>
        </article>
    `).join('');
}

function setMeta(name, content) {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

function injectArticleSchema(post, readingTime) {
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.excerpt,
        image: [post.image],
        author: { '@type': 'Person', name: post.author },
        publisher: {
            '@type': 'Organization',
            name: SITE_NAME,
            logo: { '@type': 'ImageObject', url: `${SITE_URL}/og-image.png` }
        },
        datePublished: post.date,
        dateModified: post.date,
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `${SITE_URL}/post.html?slug=${post.slug}`
        },
        articleSection: post.categoryLabel || post.category,
        keywords: (post.tags || []).join(', '),
        timeRequired: `PT${readingTime}M`
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
}

/* ===========================================================
   Shared UI: mobile menu, theme toggle, current year
   =========================================================== */
function initShared() {
    const toggle = document.getElementById('menuToggle');
    const links = document.getElementById('navLinks');
    if (toggle && links) {
        toggle.addEventListener('click', () => links.classList.toggle('open'));
    }

    // Theme: URL ?theme=light|dark wins, otherwise localStorage
    const urlTheme = new URLSearchParams(location.search).get('theme');
    const saved = urlTheme || localStorage.getItem('mn6-theme');
    if (saved === 'light') document.documentElement.classList.add('light');
    if (saved === 'dark') document.documentElement.classList.remove('light');
    if (urlTheme === 'light' || urlTheme === 'dark') localStorage.setItem('mn6-theme', urlTheme);

    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('light');
            localStorage.setItem(
                'mn6-theme',
                document.documentElement.classList.contains('light') ? 'light' : 'dark'
            );
        });
    }

    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}

/* ---------- Bootstrap ---------- */
document.addEventListener('DOMContentLoaded', () => {
    initShared();
    initHub();
    initPost();
});

/* ===========================================================
   Comments & Search Integration
   =========================================================== */

async function renderComments(post) {
    const article = document.getElementById('articleRoot');
    if (!article) return;

    const commentsSection = document.createElement('section');
    commentsSection.className = 'comments-section container';
    commentsSection.style.marginTop = '3rem';
    commentsSection.innerHTML = `
        <h2 style="margin-bottom: 1.5rem;">💬 التعليقات</h2>
        <div id="commentsList" class="comments-list">
            ${(post.comments || []).filter(c => c.approved).map(c => `
                <div class="comment-item" style="background: var(--surface); padding: 1rem; border-radius: 10px; margin-bottom: 1rem; border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                        <strong>${c.name}</strong>
                        <small style="color: var(--text-soft);">${fmtDate(c.date)}</small>
                    </div>
                    <p style="margin: 0;">${c.text}</p>
                </div>
            `).join('') || '<p style="color: var(--text-soft);">لا توجد تعليقات بعد. كن أول من يعلق!</p>'}
        </div>
        <div class="comment-form" style="margin-top: 2rem; background: var(--surface-2); padding: 1.5rem; border-radius: 14px;">
            <h3 style="margin-bottom: 1rem;">أضف تعليقاً</h3>
            <form id="commentForm">
                <input type="hidden" name="slug" value="${post.slug}">
                <div style="margin-bottom: 1rem;">
                    <input type="text" name="name" placeholder="الاسم" required style="width: 100%; padding: 0.8rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text);">
                </div>
                <div style="margin-bottom: 1rem;">
                    <textarea name="comment" placeholder="اكتب تعليقك هنا..." required style="width: 100%; padding: 0.8rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); min-height: 100px;"></textarea>
                </div>
                <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">إرسال التعليق</button>
            </form>
            <p id="commentStatus" style="margin-top: 1rem; text-align: center; display: none;"></p>
        </div>
    `;
    article.appendChild(commentsSection);

    document.getElementById('commentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        const status = document.getElementById('commentStatus');
        const btn = e.target.querySelector('button');

        btn.disabled = true;
        btn.textContent = 'جاري الإرسال...';
        
        try {
            const res = await fetch('/api/blog/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (res.ok) {
                status.textContent = 'تم إرسال تعليقك وهو بانتظار المراجعة. شكراً لك!';
                status.style.color = 'var(--cat-sports)';
                e.target.reset();
            } else {
                throw new Error(result.error || 'حدث خطأ ما');
            }
        } catch (err) {
            status.textContent = err.message;
            status.style.color = 'var(--brand-red)';
        } finally {
            status.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'إرسال التعليق';
        }
    });
}

// Modify initPost to call renderComments
const originalInitPost = initPost;
initPost = async function() {
    await originalInitPost();
    const slug = getQueryParam('slug');
    if (slug) {
        const posts = await fetchPosts();
        const post = posts.find(p => p.slug === slug);
        if (post) renderComments(post);
    }
};
