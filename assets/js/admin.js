/* ============================================================
   Matric Nejma 6 — Admin Panel (Vanilla JS)
   Auth, dashboard, messages, posts manager, settings.
   ============================================================ */

const API = '/api';
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

/* ---------- HTTP helpers ---------- */
async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (state.token && path.startsWith('/admin/')) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(API + path, { ...opts, headers });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
        if (res.status === 401 && path !== '/admin/login') {
            logout();
            throw new Error('انتهت الجلسة، الرجاء تسجيل الدخول مجدداً.');
        }
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}

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
        await api('/admin/check');
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
    btn.disabled = true; btn.textContent = 'جارٍ التحقق...';
    try {
        const data = await api('/admin/login', { method: 'POST', body: JSON.stringify({ password: pwd }) });
        state.token = data.token;
        localStorage.setItem(TOKEN_KEY, data.token);
        document.getElementById('loginPassword').value = '';
        showApp();
    } catch (e2) {
        err.textContent = e2.message;
    } finally {
        btn.disabled = false; btn.textContent = 'دخول';
    }
});

document.getElementById('logoutBtn').addEventListener('click', logout);

/* ---------- Tabs ---------- */
const TAB_TITLES = {
    dashboard: '📊 الرئيسية',
    messages: '💬 الرسائل',
    posts: '📝 المقالات',
    settings: '⚙️ الإعدادات',
};
document.querySelectorAll('.nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
function switchTab(name) {
    document.querySelectorAll('.nav-item[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(s => s.style.display = 'none');
    document.getElementById('tab-' + name).style.display = 'block';
    document.getElementById('pageTitle').textContent = TAB_TITLES[name] || '';
    document.getElementById('sidebar').classList.remove('open');
}

document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
});

document.getElementById('refreshBtn').addEventListener('click', loadAll);

/* ---------- Loaders ---------- */
async function loadAll() {
    try {
        const [stats, msgs, posts] = await Promise.all([
            api('/admin/stats'),
            api('/admin/messages'),
            api('/admin/posts'),
        ]);
        state.messages = msgs.messages || [];
        state.posts = posts.posts || [];
        renderDashboard(stats);
        renderMessages();
        renderPosts();
        const unread = state.messages.filter(m => !m.read).length;
        const badge = document.getElementById('unreadBadge');
        badge.textContent = unread;
        badge.style.display = unread ? 'inline-block' : 'none';
    } catch (e) {
        toast(e.message, 'error');
    }
}

/* ---------- Dashboard ---------- */
function renderDashboard(s) {
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = `
        <div class="stat-card accent">
            <span class="label">إجمالي الرسائل</span>
            <span class="value">${s.messagesTotal}</span>
            <span class="sub">رسائل من نموذج الاتصال</span>
        </div>
        <div class="stat-card">
            <span class="label">رسائل غير مقروءة</span>
            <span class="value">${s.messagesUnread}</span>
            <span class="sub">بحاجة للمراجعة</span>
        </div>
        <div class="stat-card success">
            <span class="label">رسائل آخر 7 أيام</span>
            <span class="value">${s.messagesLast7Days}</span>
            <span class="sub">نشاط الأسبوع الأخير</span>
        </div>
        <div class="stat-card cyan">
            <span class="label">إجمالي المقالات</span>
            <span class="value">${s.postsTotal}</span>
            <span class="sub">منشورات في المدونة</span>
        </div>
    `;
    const recent = state.messages.slice(0, 5);
    const rows = recent.length ? recent.map(m => `
        <tr class="${m.read ? '' : 'unread'}">
            <td>${escapeHTML(m.subject)}</td>
            <td><div>${escapeHTML(m.name)}</div><div style="color:var(--text-soft);font-size:.8rem">${escapeHTML(m.email)}</div></td>
            <td>${formatDateTime(m.createdAt)}</td>
            <td><button class="btn btn-sm" onclick="openMessage('${m.id}')">عرض</button></td>
        </tr>
    `).join('') : `<tr><td colspan="4" class="empty">لا توجد رسائل بعد.</td></tr>`;
    document.getElementById('dashRecent').innerHTML = rows;
}

/* ---------- Messages ---------- */
document.getElementById('msgSearch').addEventListener('input', (e) => { state.msgQuery = e.target.value; renderMessages(); });
document.getElementById('msgFilter').addEventListener('change', (e) => { state.msgFilter = e.target.value; renderMessages(); });

function renderMessages() {
    const q = state.msgQuery.trim().toLowerCase();
    const filtered = state.messages.filter(m => {
        if (state.msgFilter === 'unread' && m.read) return false;
        if (state.msgFilter === 'read' && !m.read) return false;
        if (!q) return true;
        return [m.name, m.email, m.subject, m.message].some(v => v.toLowerCase().includes(q));
    });

    if (!filtered.length) {
        document.getElementById('messagesTable').innerHTML = `<tr><td colspan="6" class="empty">لا توجد رسائل مطابقة.</td></tr>`;
        return;
    }

    document.getElementById('messagesTable').innerHTML = filtered.map(m => `
        <tr class="${m.read ? '' : 'unread'}">
            <td><span class="pill ${m.read ? 'read' : 'unread'}">${m.read ? 'مقروءة' : 'جديدة'}</span></td>
            <td>${escapeHTML(m.name)}</td>
            <td><a href="mailto:${escapeHTML(m.email)}" style="color:var(--text)">${escapeHTML(m.email)}</a></td>
            <td>${escapeHTML(m.subject)}</td>
            <td>${formatDateTime(m.createdAt)}</td>
            <td>
                <div class="row-actions">
                    <button class="btn btn-sm" onclick="openMessage('${m.id}')">📖 عرض</button>
                    <button class="btn btn-sm" onclick="toggleRead('${m.id}', ${!m.read})">${m.read ? 'وضع كغير مقروءة' : '✓ مقروءة'}</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMessage('${m.id}')">🗑 حذف</button>
                </div>
            </td>
        </tr>
    `).join('');
}

window.openMessage = async function (id) {
    const msg = state.messages.find(m => m.id === id);
    if (!msg) return;
    document.getElementById('messageModalContent').innerHTML = `
        <h2>${escapeHTML(msg.subject)}</h2>
        <p style="color:var(--text-muted); margin:.2rem 0">
            <strong>${escapeHTML(msg.name)}</strong> &lt;<a href="mailto:${escapeHTML(msg.email)}" style="color:var(--brand-rose)">${escapeHTML(msg.email)}</a>&gt;
        </p>
        <p style="color:var(--text-soft); font-size:.85rem; margin:.2rem 0 1rem">📅 ${formatDateTime(msg.createdAt)} · IP: ${escapeHTML(msg.ip || '-')}</p>
        <div style="background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:1rem; white-space:pre-wrap; line-height:1.7">${escapeHTML(msg.message)}</div>
        <div class="close-row">
            <button class="btn" onclick="closeMessageModal()">إغلاق</button>
            <a class="btn btn-primary" href="mailto:${escapeHTML(msg.email)}?subject=${encodeURIComponent('رد: ' + msg.subject)}">↩ رد بالبريد</a>
        </div>
    `;
    document.getElementById('messageModal').classList.add('open');
    if (!msg.read) await toggleRead(id, true, true);
};
window.closeMessageModal = () => document.getElementById('messageModal').classList.remove('open');
document.getElementById('messageModal').addEventListener('click', (e) => {
    if (e.target.id === 'messageModal') closeMessageModal();
});

window.toggleRead = async function (id, read, silent = false) {
    try {
        await api('/admin/messages/' + id, { method: 'PATCH', body: JSON.stringify({ read }) });
        const m = state.messages.find(x => x.id === id);
        if (m) m.read = read;
        renderMessages();
        const unread = state.messages.filter(x => !x.read).length;
        const badge = document.getElementById('unreadBadge');
        badge.textContent = unread; badge.style.display = unread ? 'inline-block' : 'none';
        if (!silent) toast('تم التحديث', 'success');
    } catch (e) { toast(e.message, 'error'); }
};

window.deleteMessage = async function (id) {
    if (!confirm('حذف هذه الرسالة نهائياً؟')) return;
    try {
        await api('/admin/messages/' + id, { method: 'DELETE' });
        state.messages = state.messages.filter(m => m.id !== id);
        renderMessages();
        toast('تم الحذف', 'success');
    } catch (e) { toast(e.message, 'error'); }
};

document.getElementById('markAllReadBtn').addEventListener('click', async () => {
    const unread = state.messages.filter(m => !m.read);
    if (!unread.length) return toast('لا توجد رسائل غير مقروءة');
    try {
        await Promise.all(unread.map(m => api('/admin/messages/' + m.id, { method: 'PATCH', body: JSON.stringify({ read: true }) })));
        unread.forEach(m => m.read = true);
        renderMessages();
        document.getElementById('unreadBadge').style.display = 'none';
        toast('تم وضع جميع الرسائل كمقروءة', 'success');
    } catch (e) { toast(e.message, 'error'); }
});

document.getElementById('exportCsvBtn').addEventListener('click', () => {
    if (!state.messages.length) return toast('لا توجد رسائل للتصدير');
    const headers = ['id', 'name', 'email', 'subject', 'message', 'read', 'createdAt'];
    const rows = state.messages.map(m => headers.map(h => csvEscape(m[h])).join(','));
    const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `messages-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast('تم تنزيل الملف', 'success');
});

/* ---------- Posts ---------- */
document.getElementById('postSearch').addEventListener('input', e => { state.postQuery = e.target.value; renderPosts(); });
document.getElementById('postFilter').addEventListener('change', e => { state.postFilter = e.target.value; renderPosts(); });

function renderPosts() {
    const q = state.postQuery.trim().toLowerCase();
    const filtered = state.posts.filter(p => {
        if (state.postFilter !== 'all' && p.category !== state.postFilter) return false;
        if (!q) return true;
        return p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
    });
    if (!filtered.length) {
        document.getElementById('postsTable').innerHTML = `<tr><td colspan="5" class="empty">لا توجد مقالات.</td></tr>`;
        return;
    }
    document.getElementById('postsTable').innerHTML = filtered.map(p => `
        <tr>
            <td>
                <div style="font-weight:700">${escapeHTML(p.title)}</div>
                <div style="color:var(--text-soft); font-size:.8rem">/${escapeHTML(p.slug)}</div>
            </td>
            <td><span class="pill cat-${p.category}">${escapeHTML(p.categoryLabel || p.category)}</span></td>
            <td>${escapeHTML(p.author)}</td>
            <td>${escapeHTML(p.date)}</td>
            <td>
                <div class="row-actions">
                    <a class="btn btn-sm" target="_blank" href="post.html?slug=${encodeURIComponent(p.slug)}">👁 عرض</a>
                    <button class="btn btn-sm" onclick="editPost('${p.slug}')">✏️ تعديل</button>
                    <button class="btn btn-sm btn-danger" onclick="deletePost('${p.slug}')">🗑 حذف</button>
                </div>
            </td>
        </tr>
    `).join('');
}

document.getElementById('newPostBtn').addEventListener('click', () => openPostModal(null));

function openPostModal(post) {
    state.editingSlug = post ? post.slug : null;
    document.getElementById('postModalTitle').textContent = post ? `✏️ تعديل: ${post.title}` : '＋ مقال جديد';
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
    document.getElementById('postModal').classList.add('open');
}
window.closePostModal = () => document.getElementById('postModal').classList.remove('open');
document.getElementById('postModal').addEventListener('click', e => {
    if (e.target.id === 'postModal') closePostModal();
});

window.editPost = function (slug) {
    const p = state.posts.find(x => x.slug === slug);
    if (p) openPostModal(p);
};
window.deletePost = async function (slug) {
    if (!confirm('حذف هذا المقال نهائياً؟')) return;
    try {
        await api('/admin/posts/' + slug, { method: 'DELETE' });
        state.posts = state.posts.filter(p => p.slug !== slug);
        renderPosts();
        toast('تم الحذف', 'success');
    } catch (e) { toast(e.message, 'error'); }
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
        tags: document.getElementById('postTags').value.split(',').map(t => t.trim()).filter(Boolean),
        content: document.getElementById('postContent').value,
    };
    try {
        if (state.editingSlug) {
            const data = await api('/admin/posts/' + state.editingSlug, { method: 'PUT', body: JSON.stringify(payload) });
            const idx = state.posts.findIndex(p => p.slug === state.editingSlug);
            if (idx !== -1) state.posts[idx] = data.post;
        } else {
            const data = await api('/admin/posts', { method: 'POST', body: JSON.stringify(payload) });
            state.posts.unshift(data.post);
        }
        renderPosts();
        closePostModal();
        toast('تم الحفظ', 'success');
    } catch (err) { toast(err.message, 'error'); }
});

/* ---------- Settings ---------- */
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = document.getElementById('currentPwd').value;
    const next = document.getElementById('newPwd').value;
    const confirm = document.getElementById('confirmPwd').value;
    if (next !== confirm) return toast('كلمتا المرور غير متطابقتين', 'error');
    try {
        await api('/admin/password', { method: 'POST', body: JSON.stringify({ current: cur, next }) });
        e.target.reset();
        toast('تم تغيير كلمة المرور بنجاح. سجّل دخولك من جديد.', 'success');
        setTimeout(logout, 1500);
    } catch (err) { toast(err.message, 'error'); }
});

/* ---------- Utils ---------- */
function escapeHTML(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function csvEscape(v) {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}
function formatDateTime(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleString('ar-MA', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) { return iso; }
}

/* ---------- Boot ---------- */
bootstrap();
