const { getPosts, setJSON, isWritable } = require('../lib/store');
const crypto = require('crypto');

function safeStr(v, max) {
    if (typeof v !== 'string') return '';
    return v.trim().slice(0, max);
}

module.exports = async (req, res) => {
    const method = req.method.toUpperCase();
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // GET /api/blog/search?q=...
    if (method === 'GET' && pathname.includes('/search')) {
        const q = (url.searchParams.get('q') || '').toLowerCase();
        const category = url.searchParams.get('category');
        const posts = await getPosts();
        
        const filtered = posts.filter(p => {
            if (!p.published && p.published !== undefined) return false;
            const matchesQuery = !q || p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q));
            const matchesCategory = !category || category === 'all' || p.category === category;
            return matchesQuery && matchesCategory;
        });
        
        return res.status(200).json({ posts: filtered });
    }

    // POST /api/blog/comments
    if (method === 'POST' && pathname.includes('/comments')) {
        const { slug, name, comment } = req.body || {};
        if (!slug || !name || !comment) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const posts = await getPosts();
        const postIndex = posts.findIndex(p => p.slug === slug);
        if (postIndex === -1) {
            return res.status(404).json({ error: 'Post not found' });
        }

        if (!posts[postIndex].comments) posts[postIndex].comments = [];
        
        const newComment = {
            id: crypto.randomUUID(),
            name: safeStr(name, 50),
            text: safeStr(comment, 1000),
            date: new Date().toISOString(),
            approved: false // Moderation by default
        };

        posts[postIndex].comments.push(newComment);
        await setJSON('posts', posts);

        return res.status(201).json({ ok: true, message: 'Comment submitted for moderation' });
    }

    return res.status(404).json({ error: 'Not found' });
};
