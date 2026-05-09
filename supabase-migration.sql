-- ============================================================
-- Matric Nejma 6 — Supabase Migration
-- Run this SQL in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql/new)
-- ============================================================

-- 1. POSTS table
CREATE TABLE IF NOT EXISTS posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'tech',
    "categoryLabel" TEXT,
    author TEXT NOT NULL DEFAULT 'فريق Matric Nejma 6',
    date TEXT,
    image TEXT DEFAULT '',
    excerpt TEXT DEFAULT '',
    tags JSONB DEFAULT '[]'::jsonb,
    content TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. MESSAGES table
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    ip TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. SETTINGS table
CREATE TABLE IF NOT EXISTS settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Insert default admin password (SHA-256 of 'admin123')
--    Hash = 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
INSERT INTO settings (key, value)
VALUES ('admin_password', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9')
ON CONFLICT (key) DO NOTHING;

-- 5. Seed sample data
INSERT INTO posts (slug, title, category, "categoryLabel", author, date, image, excerpt, content, tags)
VALUES
('world-cup-2026-where-to-watch-4k', 'أين تشاهد كأس العالم 2026 بجودة 4K', 'sports', 'رياضة', 'فريق Matric Nejma 6', '2026-03-15', 'assets/images/sports-1.webp', 'دليلك الشامل لمشاهدة مباريات كأس العالم 2026 بجودة 4K على مختلف المنصات.', '<h2>مقدمة</h2><p>تقترب بطولة كأس العالم 2026 بخطى ثابتة، ومعها يزداد البحث عن أفضل الطرق لمشاهدة المباريات بجودة عالية. في هذا المقال نقدم لكم دليلاً شاملاً لأفضل منصات البث.</p><h2>أفضل المنصات</h2><p>توفر منصات مثل beIN Sports و TOD و Shahid بثاً مباشراً بجودة 4K لمباريات كأس العالم. تأكد من اشتراكك مبكراً لتحصل على أفضل الأسعار.</p><h3>نصائح للمشاهدة</h3><p>للاستمتاع بتجربة مشاهدة مثالية، ننصح باستخدام اتصال إنترنت بسرعة لا تقل عن 25 ميجابت في الثانية، وشاشة تدعم تقنية HDR.</p>', '["كأس العالم", "بث مباشر", "4K"]'::jsonb),
('best-streaming-apps-2026', 'أفضل تطبيقات البث المباشر للأندرويد في 2026', 'tech', 'تقنية', 'فريق Matric Nejma 6', '2026-02-20', 'assets/images/tech-1.webp', 'مجموعة من أقوى تطبيقات البث المباشر التي يجب أن تكون على هاتفك الأندرويد في 2026.', '<h2>لماذا هذه التطبيقات؟</h2><p>مع تزايد منصات البث، يصعب اختيار التطبيق المناسب. قمنا بتجميع أفضل التطبيقات المجانية والمدفوعة لعام 2026.</p><h2>قائمة التطبيقات</h2><p>1. Matric Nejma 6 — التطبيق الرسمي لمشاهدة البث المباشر.<br>2. IPTV Pro — لباقة القنوات العالمية.<br>3. VLC for Android — لتشغيل روابط البث المباشر.</p>', '["أندرويد", "تطبيقات", "بث مباشر"]'::jsonb),
('watch-football-legally-online', 'كيف تشاهد كرة القدم بشكل قانوني عبر الإنترنت؟', 'legal', 'قانوني', 'فريق Matric Nejma 6', '2026-01-10', 'assets/images/legal-1.webp', 'دليل المشاهدة القانونية لمباريات كرة القدم عبر الإنترنت بعيداً عن المواقع المخالفة.', '<h2>المشاهدة القانونية</h2><p>مشاهدة المباريات عبر المنصات المرخصة تضمن لك تجربة آمنة وخالية من المشاكل القانونية. في هذا المقال نستعرض الخيارات المتاحة.</p><h2>المنصات المرخصة</h2><p>تعتبر منصات مثل beIN Sports و ESPN+ و DAZN من أبرز الناقلين الرسميين لدوريات كرة القدم حول العالم.</p><h3>تحذير</h3><p>تجنب المواقع غير المرخصة التي تعرض البث المباشر بشكل غير قانوني، حيث قد تعرضك للمساءلة القانونية والاختراقات الأمنية.</p>', '["كرة قدم", "قانوني", "بث مباشر"]'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- 6. Enable pgcrypto (for password hashing on the server)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 7. RPC: Verify admin password (returns true/false)
CREATE OR REPLACE FUNCTION verify_admin_password(input_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT value INTO stored_hash FROM settings WHERE key = 'admin_password' LIMIT 1;
    IF stored_hash IS NULL THEN RETURN FALSE; END IF;
    RETURN stored_hash = encode(digest(input_password, 'sha256'), 'hex');
END;
$$;

-- 8. RPC: Change admin password (returns true on success)
CREATE OR REPLACE FUNCTION change_admin_password(current_password TEXT, new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    stored_hash TEXT;
BEGIN
    SELECT value INTO stored_hash FROM settings WHERE key = 'admin_password' LIMIT 1;
    IF stored_hash IS NULL THEN RETURN FALSE; END IF;
    IF stored_hash != encode(digest(current_password, 'sha256'), 'hex') THEN
        RETURN FALSE;
    END IF;
    UPDATE settings SET value = encode(digest(new_password, 'sha256'), 'hex'), updated_at = now() WHERE key = 'admin_password';
    RETURN TRUE;
END;
$$;

-- 9. Enable Row Level Security (optional — for production)
-- ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 10. Allow all operations for anon key (since auth is handled at app level)
-- CREATE POLICY "anon_all_posts" ON posts FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "anon_all_messages" ON messages FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "anon_all_settings" ON settings FOR ALL USING (true) WITH CHECK (true);
