const { checkAdminAuth } = require('../../lib/auth');

module.exports = (req, res) => {
    if (!checkAdminAuth(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    return res.status(200).json({ ok: true });
};
