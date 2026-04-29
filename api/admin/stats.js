const { checkAdminAuth } = require('../../lib/auth');
const { getMessages, getPosts, envInfo } = require('../../lib/store');

module.exports = async (req, res) => {
    if (!checkAdminAuth(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
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
};
