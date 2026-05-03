const { checkAdminAuth } = require('../lib/auth');
const { getPosts, setJSON, getMessages, envInfo } = require('../lib/store');

module.exports = async (req, res) => {
    if (!checkAdminAuth(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const method = req.method.toUpperCase();
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Analytics: GET /api/admin/analytics
    if (method === 'GET' && pathname.includes('/analytics')) {
        const posts = await getPosts();
        const messages = await getMessages();
        
        // Basic analytics
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

    // Comment Management: PATCH /api/admin/comments/:postSlug/:commentId
    if (method === 'PATCH' && pathname.includes('/comments')) {
        const parts = pathname.split('/');
        const postSlug = parts[parts.length - 2];
        const commentId = parts[parts.length - 1];
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
