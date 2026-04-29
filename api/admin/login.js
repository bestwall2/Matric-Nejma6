const { checkPassword, signToken, TOKEN_TTL_MS } = require('../../lib/auth');

module.exports = (req, res) => {
    if (req.method !== 'POST') {
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
};
