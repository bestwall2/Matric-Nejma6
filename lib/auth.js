/* Stateless HMAC-signed token auth. No session storage required. */
const crypto = require('crypto');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function getPassword() {
    return process.env.ADMIN_PASSWORD || 'admin123';
}

function getSecret() {
    const explicit = process.env.ADMIN_SECRET;
    if (explicit && explicit.length >= 16) return explicit;
    return crypto.createHash('sha256').update('mn6:' + getPassword()).digest('hex');
}

function b64url(buf) {
    return Buffer.from(buf).toString('base64')
        .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlDecode(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Buffer.from(s, 'base64').toString('utf8');
}

function signToken(extra = {}) {
    const payload = JSON.stringify({ ...extra, exp: Date.now() + TOKEN_TTL_MS });
    const p = b64url(payload);
    const sig = b64url(crypto.createHmac('sha256', getSecret()).update(p).digest());
    return `${p}.${sig}`;
}

function verifyToken(token) {
    if (!token || typeof token !== 'string') return false;
    const dot = token.indexOf('.');
    if (dot < 1) return false;
    const p = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = b64url(crypto.createHmac('sha256', getSecret()).update(p).digest());
    if (sig.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    try {
        const obj = JSON.parse(b64urlDecode(p));
        return typeof obj.exp === 'number' && obj.exp > Date.now();
    } catch (_) { return false; }
}

function checkAdminAuth(req) {
    const h = req.headers.authorization || req.headers.Authorization || '';
    if (!h.startsWith('Bearer ')) return false;
    return verifyToken(h.slice(7));
}

function checkPassword(input) {
    const expected = getPassword();
    if (typeof input !== 'string' || input.length === 0) return false;
    const a = Buffer.from(input);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = {
    signToken,
    verifyToken,
    checkAdminAuth,
    checkPassword,
    TOKEN_TTL_MS,
};
