/* Storage abstraction.

   Backends, tried in priority order:
   1. Supabase  — if SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
                 (Vercel's Supabase integration provides both automatically).
                 Uses a single `public.kv_store` table:
                    create table public.kv_store (
                      key text primary key,
                      value jsonb not null,
                      updated_at timestamptz not null default now()
                    );
                    alter table public.kv_store disable row level security;
   2. Upstash   — if UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set.
   3. Files     — local dev only (./data/*.json).
   On Vercel without Supabase or Upstash, writes return false and callers respond 503.
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILES = {
    posts: path.join(ROOT, 'data', 'posts.json'),
    messages: path.join(ROOT, 'data', 'messages.json'),
};

const isVercel = !!process.env.VERCEL || !!process.env.NOW_REGION;

const supaUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const useSupabase = !!(supaUrl && supaKey);

const upstashUrl = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const upstashTok = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const useUpstash = !!(upstashUrl && upstashTok);

const KV_TABLE = 'kv_store';
const KEY_PREFIX = 'mn6:';

/* ---------- Supabase REST helpers ---------- */
function supaHeaders(extra = {}) {
    return {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        ...extra,
    };
}

async function supaGet(key) {
    const url = `${supaUrl}/rest/v1/${KV_TABLE}?key=eq.${encodeURIComponent(key)}&select=value`;
    const r = await fetch(url, { headers: supaHeaders() });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`Supabase GET ${r.status}: ${text.slice(0, 200)}`);
    }
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0].value;
}

async function supaUpsert(key, value) {
    const url = `${supaUrl}/rest/v1/${KV_TABLE}`;
    const r = await fetch(url, {
        method: 'POST',
        headers: supaHeaders({
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
        }),
        body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) {
        const text = await r.text();
        throw new Error(`Supabase UPSERT ${r.status}: ${text.slice(0, 200)}`);
    }
    return true;
}

/* ---------- Upstash REST helpers ---------- */
async function uReq(parts) {
    const url = `${upstashUrl}/${parts.map(encodeURIComponent).join('/')}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${upstashTok}` } });
    if (!r.ok) throw new Error(`Upstash HTTP ${r.status}`);
    const data = await r.json();
    return data.result;
}

/* ---------- Public API ---------- */
async function getJSON(key, fallback) {
    if (useSupabase) {
        try {
            const v = await supaGet(KEY_PREFIX + key);
            return v == null ? fallback : v;
        } catch (e) {
            console.error('[store] supabase get error:', e.message);
            return fallback;
        }
    }
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
    if (useSupabase) {
        try { await supaUpsert(KEY_PREFIX + key, value); return true; }
        catch (e) { console.error('[store] supabase set error:', e.message); return false; }
    }
    if (useUpstash) {
        try { await uReq(['set', KEY_PREFIX + key, JSON.stringify(value)]); return true; }
        catch (e) { console.error('[store] upstash set error:', e.message); return false; }
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
    // Fallback: always read from baked-in file (essential on first boot before
    // anyone has ever written posts to the remote store).
    try { return JSON.parse(fs.readFileSync(FILES.posts, 'utf8')); }
    catch (_) { return []; }
}

async function getMessages() {
    const v = await getJSON('messages', []);
    return Array.isArray(v) ? v : [];
}

function isWritable() {
    return useSupabase || useUpstash || !isVercel;
}

function envInfo() {
    return {
        isVercel,
        backend: useSupabase ? 'supabase' : (useUpstash ? 'upstash' : (isVercel ? 'readonly' : 'file')),
        writable: isWritable(),
    };
}

module.exports = { getJSON, setJSON, getPosts, getMessages, isWritable, envInfo };
