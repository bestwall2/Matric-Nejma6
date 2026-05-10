/* ============================================================
   Matric Nejma 6 — Admin Panel (Supabase-backed)
   ============================================================ */

const { createClient } = supabase;

const ENV = window.__ENV__ || {};
const SUPABASE_URL = ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
});

const TOKEN_KEY = 'mn6-admin-token';

let state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    messages: [],
    posts: [],
    msgFilter: 'all',
    msgQuery: '',
    postFilter: 'all',
    postQuery: '',
    editingSlug: null,
};

/* ---------- Toast ---------- */
function toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    setTimeout(() => el.classList.remove('show'), 2800);
}

/* ---------- Auth flow ---------- */
async function bootstrap() {
    if (!state.token) return showLogin();
    try {
        const { data, error } = await supabaseClient
            .from('settings')
            .select('value')
            .eq('key', 'admin_password')
            .single();
        if (error || !data) throw new Error('no-pwd');
        showApp();
    } catch (_) {
        showLogin();
    }
}

function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminApp').style.display = 'none';
}
function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'grid';
    loadAll();
}

function logout() {
    localStorage.removeItem(TOKEN_KEY);
    state.token = null;
    showLogin();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = document.getElementById('loginPassword').value;
    const err = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'جارٍ التحقق...';
    try {
        const { data, error } = await supabaseClient.rpc('verify_admin_password', {
            input_password: pwd,
        });
        if (error) throw new Error(error.message);
        if (!data) throw new Error('كلمة المرور غير صحيحة');
        state.token = 'authenticated';
        localStorage.setItem(TOKEN_KEY, 'authenticated');
        document.getElementById('loginPassword').value = '';
        showApp();
    } catch (e2) {
        err.textContent = e2.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'دخول';
    }
});

document.getElementById('logoutBtn').addEventListener('click', logout);

/* ---------- Tabs ---------- */
const TAB_TITLES = {
    dashboard: '📊 الرئيسية',
    messages: '💬 الرسائل',
    posts: '📝 المقالات',
    analytics: '📈 التحليلات',
    settings: '⚙️ الإعدادات',
    aiwriter: '🤖 الكتابة بالذكاء الاصطناعي',
};

document.querySelectorAll('.nav-item[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
    document
        .querySelectorAll('.nav-item[data-tab]')
        .forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document
        .querySelectorAll('.tab-content')
        .forEach((s) => (s.style.display = 'none'));
    document.getElementById('tab-' + name).style.display = 'block';
    document.getElementById('pageTitle').textContent = TAB_TITLES[name] || '';
    closeSidebar();
}

document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const isOpen = sidebar.classList.toggle('open');
    backdrop.classList.toggle('open', isOpen);
});

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('open');
}

document.getElementById('sidebarBackdrop')?.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSidebar();
});

document.getElementById('refreshBtn').addEventListener('click', loadAll);

/* ---------- Loaders ---------- */
async function loadAll() {
    try {
        const [msgsRes, postsRes] = await Promise.all([
            supabaseClient.from('messages').select('*').order('created_at', { ascending: false }),
            supabaseClient.from('posts').select('*').order('created_at', { ascending: false }),
        ]);
        if (msgsRes.error) throw new Error('فشل تحميل الرسائل: ' + msgsRes.error.message);
        if (postsRes.error) throw new Error('فشل تحميل المقالات: ' + postsRes.error.message);
        state.messages = msgsRes.data || [];
        state.posts = postsRes.data || [];
        renderDashboard();
        renderMessages();
        renderPosts();
        renderAnalytics();
        renderSettings();
        const unread = state.messages.filter((m) => !m.read).length;
        const badge = document.getElementById('unreadBadge');
        badge.textContent = unread;
        badge.style.display = unread ? 'inline-block' : 'none';
    } catch (e) {
        toast(e.message, 'error');
    }
}

function renderSettings() {
    const display = document.getElementById('envInfoDisplay');
    if (!display) return;
    display.innerHTML = `
        <div><strong>Backend:</strong> Supabase (PostgreSQL)</div>
        <div><strong>حالة الربط:</strong> ✅ متصل</div>
        <div><strong>المشروع:</strong> ${SUPABASE_URL.replace('https://', '')}</div>
    `;
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const messagesLast7Days = state.messages.filter((m) => new Date(m.created_at) >= new Date(weekAgo)).length;
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = `
        <div class="stat-card accent">
            <span class="label">إجمالي الرسائل</span>
            <span class="value">${state.messages.length}</span>
            <span class="sub">رسائل من نموذج الاتصال</span>
        </div>
        <div class="stat-card">
            <span class="label">رسائل غير مقروءة</span>
            <span class="value">${state.messages.filter((m) => !m.read).length}</span>
            <span class="sub">بحاجة للمراجعة</span>
        </div>
        <div class="stat-card success">
            <span class="label">رسائل آخر 7 أيام</span>
            <span class="value">${messagesLast7Days}</span>
            <span class="sub">نشاط الأسبوع الأخير</span>
        </div>
        <div class="stat-card cyan">
            <span class="label">إجمالي المقالات</span>
            <span class="value">${state.posts.length}</span>
            <span class="sub">منشورات في المدونة</span>
        </div>
    `;
    const recent = state.messages.slice(0, 5);
    const rows = recent.length
        ? recent
              .map(
                  (m) => `
        <tr class="${m.read ? '' : 'unread'}">
            <td>${escapeHTML(m.subject)}</td>
            <td>
                <div>${escapeHTML(m.name)}</div>
                <div style="color:var(--text-dim);font-size:.8rem">${escapeHTML(m.email)}</div>
            </td>
            <td>${formatDateTime(m.created_at)}</td>
            <td><button class="btn btn-sm" onclick="openMessage('${m.id}')">عرض</button></td>
        </tr>`
              )
              .join('')
        : '<tr><td colspan="4" class="empty">لا توجد رسائل بعد.</td></tr>';
    document.getElementById('dashRecent').innerHTML = rows;
}

/* ---------- Messages ---------- */
document.getElementById('msgSearch').addEventListener('input', (e) => {
    state.msgQuery = e.target.value;
    renderMessages();
});
document.getElementById('msgFilter').addEventListener('change', (e) => {
    state.msgFilter = e.target.value;
    renderMessages();
});

function renderMessages() {
    const q = state.msgQuery.trim().toLowerCase();
    const filtered = state.messages.filter((m) => {
        if (state.msgFilter === 'unread' && m.read) return false;
        if (state.msgFilter === 'read' && !m.read) return false;
        if (!q) return true;
        return [m.name, m.email, m.subject, m.message].some((v) =>
            (v || '').toLowerCase().includes(q)
        );
    });

    if (!filtered.length) {
        document.getElementById('messagesTable').innerHTML =
            '<tr><td colspan="6" class="empty">لا توجد رسائل مطابقة.</td></tr>';
        return;
    }

    document.getElementById('messagesTable').innerHTML = filtered
        .map(
            (m) => `
        <tr class="${m.read ? '' : 'unread'}">
            <td><span class="pill ${m.read ? 'read' : 'unread'}">${m.read ? 'مقروءة' : 'جديدة'}</span></td>
            <td>${escapeHTML(m.name)}</td>
            <td><a href="mailto:${escapeHTML(m.email)}" style="color:var(--text-neon)">${escapeHTML(m.email)}</a></td>
            <td>${escapeHTML(m.subject)}</td>
            <td>${formatDateTime(m.created_at)}</td>
            <td>
                <div class="row-actions">
                    <button class="btn btn-sm" onclick="openMessage('${m.id}')">📖 عرض</button>
                    <button class="btn btn-sm" onclick="toggleRead('${m.id}', ${!m.read})">${m.read ? 'وضع كغير مقروءة' : '✓ مقروءة'}</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMessage('${m.id}')">🗑 حذف</button>
                </div>
            </td>
        </tr>`
        )
        .join('');
}

/* ---------- Modals & UI ---------- */
const modals = {
    open(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('open');
        document.body.style.overflow = 'hidden';
        // Focus first input or button
        const focusable = el.querySelector('input, textarea, select, button');
        if (focusable) setTimeout(() => focusable.focus(), 100);
    },
    close(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('open');
        // Only restore scroll if no other modals are open
        if (!document.querySelector('.modal-overlay.open:not(#' + id + ')')) {
            document.body.style.overflow = '';
        }
    }
};

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal-overlay.open');
        if (openModal) {
            if (openModal.id === 'messageModal') closeMessageModal();
            else if (openModal.id === 'postModal') closePostModal();
            else if (openModal.id === 'aiModal') closeAIModal();
        }
    }
});

window.openMessage = async function (id) {
    const msg = state.messages.find((m) => m.id === id);
    if (!msg) return;
    document.getElementById('messageModalContent').innerHTML = `
        <button class="modal-close" onclick="closeMessageModal()" title="إغلاق">✕</button>
        <h2>
            <span style="font-size:1.4rem">✉️</span> 
            ${escapeHTML(msg.subject)}
        </h2>
        <div style="background:rgba(0,240,255,.03); border:1px solid rgba(0,240,255,.08); border-radius:12px; padding:1rem; margin-bottom:1.2rem; display:grid; gap:.25rem">
            <p style="color:var(--text-neon); margin:0; font-weight:700">
                ${escapeHTML(msg.name)} 
                <span style="color:var(--text-dim); font-weight:400; font-size:.85rem">&lt;${escapeHTML(msg.email)}&gt;</span>
            </p>
            <p style="color:var(--text-dim); font-size:.8rem; margin:0">📅 ${formatDateTime(msg.created_at)} · IP: ${escapeHTML(msg.ip || '-')}</p>
        </div>
        <div style="background:rgba(0,0,0,.4); border:1px solid var(--border-neon); border-radius:14px; padding:1.2rem; white-space:pre-wrap; line-height:1.7; font-size:.95rem; color:var(--text-neon)">${escapeHTML(msg.message)}</div>
        <div class="close-row">
            <button class="btn" onclick="closeMessageModal()">إغلاق النافذة</button>
            <a class="btn btn-primary" href="mailto:${escapeHTML(msg.email)}?subject=${encodeURIComponent('رد: ' + msg.subject)}">
                <span>↩</span> رد عبر البريد
            </a>
        </div>
    `;
    modals.open('messageModal');
    if (!msg.read) await toggleRead(id, true, true);
};
window.closeMessageModal = () => modals.close('messageModal');
document.getElementById('messageModal').addEventListener('click', (e) => {
    if (e.target.id === 'messageModal') closeMessageModal();
});

window.toggleRead = async function (id, read, silent = false) {
    try {
        const { error } = await supabaseClient
            .from('messages')
            .update({ read })
            .eq('id', id);
        if (error) throw new Error(error.message);
        const m = state.messages.find((x) => x.id === id);
        if (m) m.read = read;
        renderMessages();
        const unread = state.messages.filter((x) => !x.read).length;
        const badge = document.getElementById('unreadBadge');
        badge.textContent = unread;
        badge.style.display = unread ? 'inline-block' : 'none';
        if (!silent) toast('تم التحديث', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
};

window.deleteMessage = async function (id) {
    if (!confirm('حذف هذه الرسالة نهائياً؟')) return;
    try {
        const { error } = await supabaseClient.from('messages').delete().eq('id', id);
        if (error) throw new Error(error.message);
        state.messages = state.messages.filter((m) => m.id !== id);
        renderMessages();
        toast('تم الحذف', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
};

document.getElementById('markAllReadBtn').addEventListener('click', async () => {
    const unread = state.messages.filter((m) => !m.read);
    if (!unread.length) return toast('لا توجد رسائل غير مقروءة');
    try {
        const { error } = await supabaseClient
            .from('messages')
            .update({ read: true })
            .in('id', unread.map((m) => m.id));
        if (error) throw new Error(error.message);
        unread.forEach((m) => (m.read = true));
        renderMessages();
        document.getElementById('unreadBadge').style.display = 'none';
        toast('تم وضع جميع الرسائل كمقروءة', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
    if (!state.messages.length) return toast('لا توجد رسائل للتصدير');
    const headers = ['id', 'name', 'email', 'subject', 'message', 'read', 'created_at'];
    const rows = state.messages.map((m) =>
        headers.map((h) => csvEscape(m[h])).join(',')
    );
    const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `messages-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('تم تنزيل الملف', 'success');
});

/* ---------- Posts ---------- */
document.getElementById('postSearch').addEventListener('input', (e) => {
    state.postQuery = e.target.value;
    renderPosts();
});
document.getElementById('postFilter').addEventListener('change', (e) => {
    state.postFilter = e.target.value;
    renderPosts();
});

function renderPosts() {
    const q = state.postQuery.trim().toLowerCase();
    const filtered = state.posts.filter((p) => {
        if (state.postFilter !== 'all' && p.category !== state.postFilter) return false;
        if (!q) return true;
        return (
            (p.title || '').toLowerCase().includes(q) ||
            (p.slug || '').toLowerCase().includes(q)
        );
    });
    if (!filtered.length) {
        document.getElementById('postsTable').innerHTML =
            '<tr><td colspan="5" class="empty">لا توجد مقالات.</td></tr>';
        return;
    }
    document.getElementById('postsTable').innerHTML = filtered
        .map(
            (p) => `
        <tr>
            <td>
                <div style="font-weight:700">${escapeHTML(p.title)}</div>
                <div style="color:var(--text-dim); font-size:.8rem">/${escapeHTML(p.slug)}</div>
            </td>
            <td><span class="pill cat-${p.category}">${escapeHTML(p.categoryLabel || p.category)}</span></td>
            <td>${escapeHTML(p.author)}</td>
            <td>${escapeHTML(p.date)}</td>
            <td>
                <div class="row-actions">
                    <a class="btn btn-sm" target="_blank" href="post.html?slug=${encodeURIComponent(p.slug)}">👁 عرض</a>
                    <button class="btn btn-sm" style="background:var(--cat-tech);color:#fff" onclick='downloadStaticBlogPage(${JSON.stringify(p).replace(/'/g, "&#39;")})'>📥 SEO</button>
                    <button class="btn btn-sm" onclick="editPost('${p.slug}')">✏️ تعديل</button>
                    <button class="btn btn-sm btn-danger" onclick="deletePost('${p.slug}')">🗑 حذف</button>
                </div>
            </td>
        </tr>`
        )
        .join('');
}

document.getElementById('newPostBtn').addEventListener('click', () => openPostModal(null));

function openPostModal(post) {
    state.editingSlug = post ? post.slug : null;
    document.getElementById('postModalTitle').textContent = post
        ? `✏️ تعديل: ${post.title}`
        : '＋ مقال جديد';
    document.getElementById('postSlug').value = post?.slug || '';
    document.getElementById('postSlug').readOnly = !!post;
    document.getElementById('postCategory').value = post?.category || 'tech';
    document.getElementById('postTitle').value = post?.title || '';
    document.getElementById('postAuthor').value = post?.author || 'فريق Matric Nejma 6';
    document.getElementById('postDate').value = post?.date || new Date().toISOString().slice(0, 10);
    document.getElementById('postImage').value = post?.image || '';
    document.getElementById('postExcerpt').value = post?.excerpt || '';
    document.getElementById('postTags').value = (post?.tags || []).join(', ');
    document.getElementById('postContent').value = post?.content || '<p>اكتب محتوى المقال هنا...</p>';
    modals.open('postModal');
}
window.closePostModal = () => modals.close('postModal');
document.getElementById('postModal').addEventListener('click', (e) => {
    if (e.target.id === 'postModal') closePostModal();
});

window.editPost = function (slug) {
    const p = state.posts.find((x) => x.slug === slug);
    if (p) openPostModal(p);
};
window.deletePost = async function (slug) {
    if (!confirm('حذف هذا المقال نهائياً؟')) return;
    try {
        const { error } = await supabaseClient.from('posts').delete().eq('slug', slug);
        if (error) throw new Error(error.message);
        state.posts = state.posts.filter((p) => p.slug !== slug);
        renderPosts();
        toast('تم الحذف', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
};

const CAT_LABELS = { tech: 'تقنية', sports: 'رياضة', legal: 'قانوني' };
document.getElementById('postForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cat = document.getElementById('postCategory').value;
    const payload = {
        slug: document.getElementById('postSlug').value.trim(),
        title: document.getElementById('postTitle').value.trim(),
        category: cat,
        categoryLabel: CAT_LABELS[cat] || cat,
        author: document.getElementById('postAuthor').value.trim(),
        date: document.getElementById('postDate').value,
        image: document.getElementById('postImage').value.trim(),
        excerpt: document.getElementById('postExcerpt').value.trim(),
        tags: document
            .getElementById('postTags')
            .value.split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        content: document.getElementById('postContent').value,
    };
    try {
        let savedPost;
        if (state.editingSlug) {
            const { data, error } = await supabaseClient
                .from('posts')
                .update(payload)
                .eq('slug', state.editingSlug)
                .select()
                .single();
            if (error) throw new Error(error.message);
            savedPost = data;
            const idx = state.posts.findIndex((p) => p.slug === state.editingSlug);
            if (idx !== -1) state.posts[idx] = data;
        } else {
            const { data, error } = await supabaseClient
                .from('posts')
                .insert(payload)
                .select()
                .single();
            if (error) throw new Error(error.message);
            savedPost = data;
            state.posts.unshift(data);
        }
        renderPosts();
        
        // Auto-generate static blog page
        try {
            const staticRes = await fetch('/api/admin/posts/generate-static', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post: savedPost || payload })
            });
            if (staticRes.ok) {
                const staticData = await staticRes.json();
                toast(`تم الحفظ + صفحة SEO: ${staticData.url}`, 'success');
            } else {
                toast('تم الحفظ', 'success');
            }
        } catch (staticErr) {
            toast('تم الحفظ', 'success');
        }
        
        closePostModal();
    } catch (err) {
        toast(err.message, 'error');
    }
});

/* ---------- Analytics ---------- */
function renderAnalytics() {
    const totalPosts = state.posts.length;
    const totalMessages = state.messages.length;

    const grid = document.getElementById('analyticsGrid');
    if (!grid) return;
    grid.innerHTML = `
        <div class="stat-card">
            <span class="label">إجمالي المقالات</span>
            <span class="value">${totalPosts}</span>
            <span class="sub">منشورات نشطة</span>
        </div>
        <div class="stat-card accent">
            <span class="label">إجمالي الرسائل</span>
            <span class="value">${totalMessages}</span>
            <span class="sub">نموذج الاتصال</span>
        </div>
        <div class="stat-card success">
            <span class="label">غير مقروءة</span>
            <span class="value">${state.messages.filter((m) => !m.read).length}</span>
            <span class="sub">بحاجة للمراجعة</span>
        </div>
    `;

    const catTable = document.getElementById('categoryStatsTable');
    if (catTable) {
        const byCategory = {};
        state.posts.forEach((p) => {
            const cat = p.category || 'غير مصنف';
            byCategory[cat] = (byCategory[cat] || 0) + 1;
        });
        catTable.innerHTML =
            Object.entries(byCategory)
                .map(
                    ([cat, count]) => `
                <tr>
                    <td><span class="pill cat-${cat}">${CAT_LABELS[cat] || cat}</span></td>
                    <td>${count}</td>
                </tr>`
                )
                .join('') || '<tr><td colspan="2" class="empty">لا توجد بيانات.</td></tr>';
    }
}

/* ---------- Settings ---------- */
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = document.getElementById('currentPwd').value;
    const next = document.getElementById('newPwd').value;
    const confirmEl = document.getElementById('confirmPwd').value;
    if (next !== confirmEl) return toast('كلمتا المرور غير متطابقتين', 'error');
    try {
        const { data, error } = await supabaseClient.rpc('change_admin_password', {
            current_password: cur,
            new_password: next,
        });
        if (error) throw new Error(error.message);
        if (!data) throw new Error('كلمة المرور الحالية غير صحيحة');
        state.token = 'authenticated';
        localStorage.setItem(TOKEN_KEY, 'authenticated');
        e.target.reset();
        toast('تم تغيير كلمة المرور بنجاح', 'success');
    } catch (err) {
        toast(err.message, 'error');
    }
});

/* ---------- AI Writer (Gemini) ---------- */
const OPENROUTER_API_KEY = ENV.OPENROUTER_API_KEY;
const UNSPLASH_ACCESS_KEY = ENV.UNSPLASH_ACCESS_KEY || ''; // Get free at https://unsplash.com/developers

async function fetchUnsplashImage(keyword) {
    try {
        const res = await fetch(
            `https://api.unsplash.com/photos/random?query=${encodeURIComponent(keyword)}&orientation=landscape`,
            { headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` } }
        );
        if (!res.ok) throw new Error('Unsplash error');
        const data = await res.json();
        return data.urls.regular;
    } catch {
        return `https://loremflickr.com/1200/630/${encodeURIComponent(keyword.replace(/\s+/g, ','))}`;
    }
}

async function callAI(systemPrompt, userPrompt) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://matricnjm.online',
            'X-Title': 'Matric Nejma 6 Admin',
        },
        body: JSON.stringify({
            model: 'mistralai/mistral-small-3.2-24b-instruct',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.85,
            max_tokens: 8192,
        }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'فشل الاتصال بـ OpenRouter');
    return data.choices?.[0]?.message?.content || '';
}

function parseAIJSON(text) {
    try {
        return JSON.parse(text);
    } catch (_) {}
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
        try {
            return JSON.parse(match[0]);
        } catch (_) {}
    }
    return null;
}

function makeSlug(title) {
    return title
        .replace(/[^\w\s-]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'article-' + Date.now();
}

document.getElementById('aiGenerateBtn').addEventListener('click', async () => {
    const topic = document.getElementById('aiTopic').value.trim();
    const category = document.getElementById('aiCategory').value;
    if (!topic) return toast('الرجاء إدخال موضوع المقال', 'error');

    const btn = document.getElementById('aiGenerateBtn');
    const loading = document.getElementById('aiLoading');
    const result = document.getElementById('aiResult');
    const progress = document.getElementById('aiProgressBar');

    btn.disabled = true;
    btn.textContent = 'جارٍ الإنشاء...';
    loading.style.display = 'block';
    result.style.display = 'none';
    progress.style.width = '0%';

    let progressVal = 0;
    const progressInterval = setInterval(() => {
        progressVal = Math.min(progressVal + Math.random() * 12, 85);
        progress.style.width = progressVal + '%';
    }, 600);

    const catLabels = { tech: 'تقنية', sports: 'رياضة', legal: 'قانوني' };

    const systemPrompt = `أنت كاتب محتوى محترف للمدونة باللغة العربية. تكتب مقالات أصلية 100% متوافقة مع Google AdSense. تخرج النتيجة بصيغة JSON فقط بدون أي markdown أو أكواد برمجية.`;
    const userPrompt = `اكتب مقالاً كاملاً بالعربية عن التالي:

الموضوع: ${topic}
التصنيف: ${category} (${catLabels[category] || category})

المطلوب في JSON:
{
  "title": "عنوان احترافي جذاب",
  "slug": "english-slug-for-url",
  "excerpt": "مقدمة 2-3 جمل",
  "content": "<h2>عنوان فرعي</h2><p>محتوى HTML كامل مع h2, h3, p, ul, blockquote</p>",
  "tags": ["وسم1", "وسم2", "وسم3"],
  "image_keyword": "english keyword for image"
}

شروط المحتوى: فريد 100%، متوافق مع AdSense، 600-1000 كلمة، محسّن SEO، مقسم لأقسام، مناسب لجمهور عربي.`;

    try {
        const raw = await callAI(systemPrompt, userPrompt);
        progress.style.width = '95%';

        const parsed = parseAIJSON(raw);
        if (!parsed) throw new Error('لم يتمكن الذكاء الاصطناعي من إنشاء المقال بصيغة صحيحة. حاول مرة أخرى.');

        const title = parsed.title || 'عنوان المقال';
        const slug = parsed.slug || makeSlug(title);
        const excerpt = parsed.excerpt || '';
        const content = parsed.content || '<p>المحتوى</p>';
        const tags = Array.isArray(parsed.tags) ? parsed.tags.join(', ') : '';
        const imgKeyword = parsed.image_keyword || topic.replace(/[^\w\s]/g, ' ').trim().split(' ')[0] || 'blog';
        const imageUrl = await fetchUnsplashImage(imgKeyword);

        document.getElementById('aiResultTitle').value = title;
        document.getElementById('aiResultSlug').value = slug;
        document.getElementById('aiResultCategory').value = category;
        document.getElementById('aiResultImage').value = imageUrl;
        document.getElementById('aiResultExcerpt').value = excerpt;
        document.getElementById('aiResultTags').value = tags;
        document.getElementById('aiResultContent').value = content;

        progress.style.width = '100%';
        setTimeout(() => {
            loading.style.display = 'none';
            result.style.display = 'block';
            result.scrollIntoView({ behavior: 'smooth', block: 'start' });
            toast('✅ تم إنشاء المقال بنجاح! يمكنك تعديله قبل الحفظ.', 'success');
        }, 400);
    } catch (e) {
        loading.style.display = 'none';
        toast(e.message, 'error');
    } finally {
        clearInterval(progressInterval);
        btn.disabled = false;
        btn.textContent = '🤖 إنشاء المقال';
    }
});

document.getElementById('aiSaveBtn').addEventListener('click', async () => {
    const title = document.getElementById('aiResultTitle').value.trim();
    const slug = document.getElementById('aiResultSlug').value.trim();
    const category = document.getElementById('aiResultCategory').value;
    const image = document.getElementById('aiResultImage').value.trim();
    const excerpt = document.getElementById('aiResultExcerpt').value.trim();
    const tagsRaw = document.getElementById('aiResultTags').value.trim();
    const content = document.getElementById('aiResultContent').value.trim();

    if (!title || !slug || !content) return toast('العنوان والـ Slug والمحتوى مطلوبة', 'error');
    if (!/^[a-z0-9-]+$/.test(slug)) return toast('الـ Slug يجب أن يحتوي على حروف لاتينية صغيرة وأرقام وشَرطات فقط', 'error');

    const saveBtn = document.getElementById('aiSaveBtn');
    const downloadBtn = document.getElementById('aiDownloadBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'جارٍ الحفظ...';

    const catLabels = { tech: 'تقنية', sports: 'رياضة', legal: 'قانوني' };
    const payload = {
        slug,
        title,
        category,
        categoryLabel: catLabels[category] || category,
        author: 'فريق Matric Nejma 6',
        date: new Date().toISOString().slice(0, 10),
        image: image || '',
        excerpt: excerpt || title,
        tags: tagsRaw.split(',').map((t) => t.trim()).filter(Boolean),
        content: content || '<p></p>',
    };

    try {
        const { data: inserted, error } = await supabaseClient.from('posts').insert(payload).select().single();
        if (error) throw new Error(error.message);
        if (inserted) state.posts.unshift(inserted);
        
        // Auto-generate static blog page
        try {
            const staticRes = await fetch('/api/admin/posts/generate-static', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post: payload })
            });
            if (staticRes.ok) {
                const staticData = await staticRes.json();
                toast(`✅ تم حفظ المقال + إنشاء صفحة SEO (${staticData.url})`, 'success');
            } else {
                toast('✅ تم حفظ المقال في قاعدة البيانات (صفحة SEO فشل إنشاؤها)', 'success');
            }
        } catch (staticErr) {
            console.error('Static generation error:', staticErr);
            toast('✅ تم حفظ المقال في قاعدة البيانات', 'success');
        }
        
        document.getElementById('aiClearBtn').click();
        switchTab('posts');
        
    } catch (e) {
        toast(e.message, 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 حفظ المقال في قاعدة البيانات';
    }
});

document.getElementById('aiDownloadBtn')?.addEventListener('click', function() {
    const post = window.latestSavedPost;
    if (!post) return toast('لا يوجد مقال محفوظ للتنزيل', 'error');
    downloadStaticBlogPage(post);
    this.style.display = 'none';
});

document.getElementById('aiClearBtn').addEventListener('click', () => {
    document.getElementById('aiResult').style.display = 'none';
    document.getElementById('aiTopic').value = '';
    document.getElementById('aiResultTitle').value = '';
    document.getElementById('aiResultSlug').value = '';
    document.getElementById('aiResultImage').value = '';
    document.getElementById('aiResultExcerpt').value = '';
    document.getElementById('aiResultTags').value = '';
    document.getElementById('aiResultContent').value = '';
});

/* ---------- Static Blog Page Generator for SEO ---------- */
function generateStaticBlogHTML(post) {
    const SITE_URL = 'https://www.matricnjm.online';
    const SITE_NAME = 'Matric Nejma 6';
    const today = new Date().toISOString().slice(0, 10);
    
    const categoryLabels = { tech: 'تقنية', sports: 'رياضة', legal: 'قانوني' };
    const category = post.category || 'tech';
    const categoryLabel = categoryLabels[category] || category;
    
    const tags = Array.isArray(post.tags) ? post.tags.join(', ') : '';
    const image = post.image || 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80';
    
    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${post.title} — ${SITE_NAME}</title>
    <meta name="description" content="${post.excerpt || post.title}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${SITE_URL}/blog/${post.slug}.html">
    <meta name="theme-color" content="#e11d48">
    <link rel="icon" type="image/svg+xml" href="../assets/logo.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Tajawal:wght@500;700;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../assets/css/blog.css">
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": "${post.title}",
        "description": "${post.excerpt || post.title}",
        "image": "${image}",
        "author": { "@type": "Organization", "name": "${post.author || SITE_NAME}" },
        "publisher": {
            "@type": "Organization",
            "name": "${SITE_NAME}",
            "logo": { "@type": "ImageObject", "url": "${SITE_URL}/assets/logo.svg" }
        },
        "datePublished": "${post.date || today}",
        "dateModified": "${today}",
        "mainEntityOfPage": "${SITE_URL}/blog/${post.slug}.html"
    }
    </script>
</head>
<body>
    <header class="site-header">
        <div class="container nav">
            <a href="../index.html" class="brand"><img src="../assets/logo.svg" alt="${SITE_NAME}" loading="lazy" style="width:32px;height:32px"><span>${SITE_NAME}</span></a>
            <nav aria-label="القائمة الرئيسية"><ul class="nav-links" id="navLinks">
                <li><a href="../index.html">الرئيسية</a></li>
                <li><a href="../blog.html" class="active">المدونة</a></li>
                <li><a href="../about.html">من نحن</a></li>
                <li><a href="../contact.html">تواصل معنا</a></li>
            </ul></nav>
            <div class="nav-tools"><button id="themeToggle" class="icon-btn" aria-label="تبديل المظهر">🌓</button><button id="menuToggle" class="icon-btn menu-toggle" aria-label="القائمة">☰</button></div>
        </div>
    </header>

    <main class="container static-page">
        <article class="prose">
            <p><a href="../blog.html">المدونة</a> / ${categoryLabel}</p>
            <h1>${post.title}</h1>
            ${post.content}
        </article>
    </main>

    <footer class="site-footer"><div class="container"><div class="footer-grid">
        <div><h4>${SITE_NAME}</h4><p>موقع تحريري عربي يهتم بتقنيات البث الرياضي وتجربة مشاهدة كرة القدم.</p></div>
        <div><h4>روابط</h4><ul><li><a href="../about.html">من نحن</a></li><li><a href="../terms.html">شروط الاستخدام</a></li><li><a href="../privacy.html">سياسة الخصوصية</a></li><li><a href="../contact.html">تواصل معنا</a></li></ul></div>
        <div><h4>تابعنا</h4><p>لا توجد حسابات اجتماعية رسمية حالياً.</p></div>
    </div><div class="copyright">© <span id="year"></span> ${SITE_NAME} — جميع الحقوق محفوظة.</div></div></footer>
    <script src="../assets/js/posts.js"></script>
</body>
</html>`;
}

window.downloadStaticBlogPage = function(post) {
    const html = generateStaticBlogHTML(post);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${post.slug}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast('تم تنزيل ملف HTML-static. حمّله إلى مجلد blog/', 'success');
};

/* ---------- Utils ---------- */
function escapeHTML(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function csvEscape(v) {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}
function formatDateTime(iso) {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleString('ar-MA', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) {
        return iso;
    }
}

/* ---------- Boot ---------- */
bootstrap();
