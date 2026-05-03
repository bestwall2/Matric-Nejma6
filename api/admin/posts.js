const { checkAdminAuth } = require('../../lib/auth');
const { getPosts, setJSON, isWritable } = require('../../lib/store');

function safeStr(v, max) {
    if (typeof v !== 'string') return '';
    return v.trim().slice(0, max);
}

function sanitizePost(input) {
    return {
        slug: safeStr(input.slug, 120),
        title: safeStr(input.title, 250),
        category: safeStr(input.category, 50) || 'tech',
        categoryLabel: safeStr(input.categoryLabel, 50) || safeStr(input.category, 50) || 'tech',
        author: safeStr(input.author, 120) || 'فريق Matric Nejma 6',
        date: safeStr(input.date, 30) || new Date().toISOString().slice(0, 10),
        image: safeStr(input.image, 500),
        excerpt: safeStr(input.excerpt, 500),
        tags: Array.isArray(input.tags) ? input.tags.map(t => safeStr(t, 50)).filter(Boolean).slice(0, 12) : [],
        content: typeof input.content === 'string' ? input.content.slice(0, 100000) : '',
        related: Array.isArray(input.related) ? input.related.map(s => safeStr(s, 120)).filter(Boolean).slice(0, 10) : [],
        comments: Array.isArray(input.comments) ? input.comments : [],
        views: parseInt(input.views) || 0,
        published: input.published !== false
    };
}

module.exports = async (req, res) => {
    if (!checkAdminAuth(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    if (req.method === 'GET') {
        return res.status(200).json({ posts: await getPosts() });
    }

    if (req.method === 'POST') {
        if (!isWritable()) {
            return res.status(503).json({
                ok: false,
                error: 'التخزين للقراءة فقط هنا. فعِّل Upstash Redis لإضافة المقالات من اللوحة، أو عدِّل data/posts.json في المستودع.',
            });
        }
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const post = sanitizePost(body);
        if (!post.slug || !post.title) {
            return res.status(400).json({ ok: false, error: 'الـ slug والعنوان مطلوبان' });
        }
        const posts = await getPosts();
        if (posts.some(p => p.slug === post.slug)) {
            return res.status(409).json({ ok: false, error: 'يوجد مقال بنفس الـ slug' });
        }
        posts.unshift(post);
        await setJSON('posts', posts);
        return res.status(201).json({ ok: true, post });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
