# Matric Nejma 6 - تطبيق ماتريك نجمة 6 للبث المباشر

المصدر الرسمي لتطبيق Matric Nejma 6 (ماتريك نجمة 6) لمشاهدة البث المباشر لكرة القدم.

## المميزات

- 📱 تصميم متجاوب يعمل على جميع الأجهزة (هواتف، أجهزة لوحية، حواسيب)
- 🗄️ قاعدة بيانات Supabase لتخزين和管理 جميع البيانات
- 🔐 لوحة تحكم آمنة للإدارة
- 📝 نظام تدوين متكامل
- 📬 نموذج اتصال مع حفظ الرسائل في قاعدة البيانات

## الإعداد

### 1. إعداد Supabase

قم بتشغيل ملف SQL التالي في محرر SQL الخاص بـ Supabase:

```sql
-- Matric Nejma 6 — Supabase one-time setup
create table if not exists public.kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.kv_store disable row level security;

create index if not exists kv_store_updated_at_idx on public.kv_store (updated_at desc);
```

### 2. متغيرات البيئة

أنشئ ملف `.env` في الجذر مع المتغيرات التالية:

```env
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
ADMIN_PASSWORD="admin123"
```

### 3. النشر على Vercel

تم تكوين المشروع للعمل مع Vercel. تأكد من إضافة متغيرات البيئة في لوحة تحكم Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`

## الهيكل

```
/workspace
├── index.html          # الصفحة الرئيسية
├── blog.html           # المدونة
├── post.html           # عرض المقال
├── contact.html        # صفحة الاتصال
├── admin.html          # لوحة التحكم
├── privacy.html        # سياسة الخصوصية
├── assets/
│   ├── css/
│   │   └── blog.css    # الأنماط المشتركة
│   └── js/
│       ├── posts.js    # منطق التدوين
│       └── admin.js    # منطق لوحة التحكم
├── api/
│   ├── messages.js     # API إرسال الرسائل
│   └── admin/          # APIs لوحة التحكم
├── lib/
│   ├── store.js        # تخزين البيانات (Supabase)
│   └── auth.js         # المصادقة
└── scripts/
    └── supabase-init.sql
```

## لوحة التحكم

الوصول إلى لوحة التحكم: `/admin.html`

كلمة المرور الافتراضية: `admin123`

**مهم:** قم بتغيير كلمة المرور من خلال متغير البيئة `ADMIN_PASSWORD`.

## التوافق مع الأجهزة المحمولة

تم تحسين التطبيق للعمل على:

- 📱 الهواتف الذكية (جميع الأحجام)
- 📱 الأجهزة اللوحية
- 💻 الحواسيب المكتبية والمحمولة
- 🖥️ الشاشات الكبيرة

يستخدم التصميم:
- CSS Grid و Flexbox للتخطيط المتجاوب
- Media queries للأحجام المختلفة
- وحدات نسبية (rem, em, vw, vh)
- clamp() للنصوص المرنة

## التقنيات المستخدمة

- HTML5, CSS3, JavaScript (Vanilla)
- Tailwind CSS (عبر CDN)
- Supabase (قاعدة البيانات)
- Vercel (الاستضافة والنشر)

## الترخيص

جميع الحقوق محفوظة © Matric Nejma 6
