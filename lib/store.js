/* Storage abstraction.
   - Locally (no Vercel env): reads/writes JSON files in ./data
   - On Vercel with Upstash REST env vars: uses Upstash Redis
   - On Vercel without Upstash: read-only — posts come from baked-in data/posts.json,
     writes return false (callers respond with 503).
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = {
    posts: path.join(ROOT, 'data', 'posts.json'),
    messages: path.join(ROOT, 'data', 'messages.json'),
};

const isVercel = !!process.env.VERCEL || !!process.env.NOW_REGION;
const upstashUrl = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const upstashTok = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const useUpstash = !!(upstashUrl && upstashTok);
const KEY_PREFIX = 'mn6:';

async function uReq(parts) {
    const url = `${upstashUrl}/${parts.map(encodeURIComponent).join('/')}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${upstashTok}` } });
    if (!r.ok) throw new Error(`Upstash HTTP ${r.status}`);
    const data = await r.json();
    return data.result;
}

async function getJSON(key, fallback) {
    if (useUpstash) {
        try {
            const raw = await uReq(['get', KEY_PREFIX + key]);
            if (raw == null) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            console.error('[store] upstash get error:', e.message);
            return fallback;
        }
    }
    const file = FILES[key];
    if (!file) return fallback;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { return fallback; }
}

async function setJSON(key, value) {
    if (useUpstash) {
        try {
            await uReq(['set', KEY_PREFIX + key, JSON.stringify(value)]);
            return true;
        } catch (e) {
            console.error('[store] upstash set error:', e.message);
            return false;
        }
    }
    if (isVercel) return false;
    const file = FILES[key];
    if (!file) return false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    return true;
}

async function getPosts() {
    const stored = await getJSON('posts', null);
    if (Array.isArray(stored) && stored.length) return stored;
    // Fallback: always read from baked-in file (essential on Vercel without Upstash)
    try { return JSON.parse(fs.readFileSync(FILES.posts, 'utf8')); }
    catch (_) { return []; }
}

async function getMessages() {
    return await getJSON('messages', []);
}

function isWritable() {
    return useUpstash || !isVercel;
}

function envInfo() {
    return {
        isVercel,
        useUpstash,
        writable: isWritable(),
    };
}

module.exports = { getJSON, setJSON, getPosts, getMessages, isWritable, envInfo };
