const { checkAdminAuth } = require('../../lib/auth');
const { getMessages } = require('../../lib/store');

module.exports = async (req, res) => {
    if (!checkAdminAuth(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    return res.status(200).json({ messages: await getMessages() });
};
