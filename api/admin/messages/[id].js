const { checkAdminAuth } = require('../../../lib/auth');
const { getMessages, setJSON, isWritable } = require('../../../lib/store');

module.exports = async (req, res) => {
    if (!checkAdminAuth(req)) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    if (!isWritable()) {
        return res.status(503).json({
            ok: false,
            error: 'التخزين للقراءة فقط في هذه البيئة. أضف Upstash Redis لتفعيل التعديل.',
        });
    }
    const id = String((req.query && req.query.id) || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

    const messages = await getMessages();
    const idx = messages.findIndex(m => m.id === id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Not found' });

    if (req.method === 'PATCH') {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        if ('read' in body) messages[idx].read = !!body.read;
        await setJSON('messages', messages);
        return res.status(200).json({ ok: true, message: messages[idx] });
    }
    if (req.method === 'DELETE') {
        messages.splice(idx, 1);
        await setJSON('messages', messages);
        return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
