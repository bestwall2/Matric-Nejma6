const { checkAdminAuth, checkPassword, signToken, TOKEN_TTL_MS } = require('../../lib/auth');
const { getPosts, setJSON, getMessages, isWritable, envInfo } = require('../../lib/store');

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
    const method = req.method.toUpperCase();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // POST /api/admin/login (public)
    if (pathname === '/api/admin/login') {
        if (method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ ok: false, error: 'Method not allowed' });
        }
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const password = String(body.password || '');
        if (!checkPassword(password)) {
            return res.status(401).json({ ok: false, error: 'كلمة السر غير صحيحة' });
        }
        return res.status(200).json({
            ok: true,
            token: signToken(),
            expiresIn: TOKEN_TTL_MS,
        });
    }

    // All routes below require auth
    if (!checkAdminAuth(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    // GET /api/admin/check
    if (pathname === '/api/admin/check') {
        return res.status(200).json({ ok: true });
    }

    // GET /api/admin/stats
    if (pathname === '/api/admin/stats') {
        const messages = await getMessages();
        const posts = await getPosts();
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const last7 = messages.filter(m => {
            const t = new Date(m.createdAt || 0).getTime();
            return Number.isFinite(t) && t > cutoff;
        }).length;
        const byCat = {};
        posts.forEach(p => { byCat[p.category] = (byCat[p.category] || 0) + 1; });
        return res.status(200).json({
            messagesTotal: messages.length,
            messagesUnread: messages.filter(m => !m.read).length,
            messagesLast7Days: last7,
            postsTotal: posts.length,
            postsByCategory: byCat,
            env: envInfo(),
        });
    }

    // GET /api/admin/analytics
    if (pathname === '/api/admin/analytics') {
        const posts = await getPosts();
        const messages = await getMessages();
        const totalViews = posts.reduce((sum, p) => sum + (p.views || 0), 0);
        const postsByCategory = posts.reduce((acc, p) => {
            acc[p.category] = (acc[p.category] || 0) + 1;
            return acc;
        }, {});
        const recentMessages = messages.slice(0, 10);
        const unreadMessages = messages.filter(m => !m.read).length;
        return res.status(200).json({
            stats: {
                totalPosts: posts.length,
                totalMessages: messages.length,
                totalViews,
                unreadMessages
            },
            postsByCategory,
            recentMessages,
            env: envInfo()
        });
    }

    // GET /api/admin/messages
    if (pathname === '/api/admin/messages' && method === 'GET') {
        return res.status(200).json({ messages: await getMessages() });
    }

    // PATCH|DELETE /api/admin/messages/:id
    const msgMatch = pathname.match(/^\/api\/admin\/messages\/([^/]+)$/);
    if (msgMatch) {
        if (!isWritable()) {
            return res.status(503).json({
                ok: false,
                error: 'التخزين للقراءة فقط في هذه البيئة. أضف Upstash Redis لتفعيل التعديل.',
            });
        }
        const id = msgMatch[1];
        const messages = await getMessages();
        const idx = messages.findIndex(m => m.id === id);
        if (idx === -1) return res.status(404).json({ ok: false, error: 'Not found' });

        if (method === 'PATCH') {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            if ('read' in body) messages[idx].read = !!body.read;
            await setJSON('messages', messages);
            return res.status(200).json({ ok: true, message: messages[idx] });
        }
        if (method === 'DELETE') {
            messages.splice(idx, 1);
            await setJSON('messages', messages);
            return res.status(200).json({ ok: true });
        }
        res.setHeader('Allow', 'PATCH, DELETE');
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    // GET|POST /api/admin/posts
    if (pathname === '/api/admin/posts') {
        if (method === 'GET') {
            return res.status(200).json({ posts: await getPosts() });
        }
        if (method === 'POST') {
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
    }

    // POST /api/admin/posts/generate-static
    if (pathname === '/api/admin/posts/generate-static') {
        return res.status(501).json({ ok: false, error: 'Not available in serverless environment' });
    }

    // PUT|DELETE /api/admin/posts/:slug
    const postMatch = pathname.match(/^\/api\/admin\/posts\/([^/]+)$/);
    if (postMatch) {
        if (!isWritable()) {
            return res.status(503).json({
                ok: false,
                error: 'التخزين للقراءة فقط هنا. فعِّل Upstash Redis، أو عدِّل data/posts.json وأعد النشر.',
            });
        }
        const slug = postMatch[1];
        const posts = await getPosts();
        const idx = posts.findIndex(p => p.slug === slug);
        if (idx === -1) return res.status(404).json({ ok: false, error: 'Not found' });

        if (method === 'PUT') {
            const body = (req.body && typeof req.body === 'object') ? req.body : {};
            const updated = sanitizePost({ ...posts[idx], ...body, slug: posts[idx].slug });
            posts[idx] = updated;
            await setJSON('posts', posts);
            return res.status(200).json({ ok: true, post: updated });
        }
        if (method === 'DELETE') {
            posts.splice(idx, 1);
            await setJSON('posts', posts);
            return res.status(200).json({ ok: true });
        }
        res.setHeader('Allow', 'PUT, DELETE');
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    // POST /api/admin/password
    if (pathname === '/api/admin/password') {
        if (method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ ok: false, error: 'Method not allowed' });
        }
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const currentOk = checkPassword(String(body.current || ''));
        if (!currentOk) {
            return res.status(401).json({ ok: false, error: 'كلمة السر الحالية غير صحيحة' });
        }
        return res.status(501).json({
            ok: false,
            error: 'تغيير كلمة السر من اللوحة معطّل في بيئة Vercel. عدِّل المتغير ADMIN_PASSWORD في إعدادات Environment Variables ثم أعد النشر.',
        });
    }

    // PATCH /api/admin/comments/:postSlug/:commentId
    const commentMatch = pathname.match(/^\/api\/admin\/comments\/([^/]+)\/([^/]+)$/);
    if (commentMatch) {
        const postSlug = commentMatch[1];
        const commentId = commentMatch[2];
        const { approved } = req.body || {};
        const posts = await getPosts();
        const postIndex = posts.findIndex(p => p.slug === postSlug);
        if (postIndex === -1) return res.status(404).json({ error: 'Post not found' });
        const commentIndex = posts[postIndex].comments.findIndex(c => c.id === commentId);
        if (commentIndex === -1) return res.status(404).json({ error: 'Comment not found' });
        posts[postIndex].comments[commentIndex].approved = approved;
        await setJSON('posts', posts);
        return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: 'Not found' });
};
