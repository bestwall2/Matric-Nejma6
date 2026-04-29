const { checkAdminAuth, checkPassword } = require('../../lib/auth');

module.exports = (req, res) => {
    if (!checkAdminAuth(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    if (req.method !== 'POST') {
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
};
