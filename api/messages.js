const crypto = require('crypto');
const { getMessages, setJSON, isWritable } = require('../lib/store');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (body.website) return res.status(200).json({ ok: true });

    const name = String(body.name || '').trim().slice(0, 200);
    const email = String(body.email || '').trim().slice(0, 200);
    const subject = String(body.subject || '').trim().slice(0, 200);
    const message = String(body.message || '').trim().slice(0, 5000);

    if (!name || !email || !message) {
        return res.status(400).json({ ok: false, error: 'الاسم والبريد والرسالة مطلوبة' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ ok: false, error: 'البريد الإلكتروني غير صالح' });
    }

    const entry = {
        id: crypto.randomUUID(),
        name, email, subject, message,
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown',
        userAgent: req.headers['user-agent'] || '',
        read: false,
        createdAt: new Date().toISOString(),
    };

    if (isWritable()) {
        try {
            const messages = await getMessages();
            messages.unshift(entry);
            await setJSON('messages', messages.slice(0, 1000));
        } catch (e) {
            console.error('[messages] store error:', e);
        }
    } else {
        // Read-only environment (Vercel without Upstash). At least surface the
        // submission in the function logs so it isn't silently lost.
        console.log('[contact-form]', JSON.stringify(entry));
    }

    return res.status(200).json({ ok: true, id: entry.id });
};
