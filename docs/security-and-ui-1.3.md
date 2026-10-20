# Am-Kh 1.3 / Android code 4 / v1.3-b76

## التغييرات

- رجوع بوابة المتجر الأصلية مع خفض كلفة الرسم، وبوابة جوائز ومخزون بنفس الصوت ولوحة الألوان البنفسجية والذهبية.
- اختيار صعوبة الألغاز المصنفة في نافذة اللعبة، بثيم المستخدم ولغته. Chess.com يوثق Standard / Hard / Extra Hard؛ المصدر: https://support.chess.com/en/articles/8602396-how-do-puzzle-ratings-work . ثوابته الدقيقة للتقييم غير منشورة، لذا لا ندعي تطابق أرقامه الداخلية.
- مكافآت تحديات الرئيسية تعرض AK وصورة العملة ورمز المستوى/XP الموجود بالفعل.
- تقارير من رسائل الأصدقاء والمجموعات وشات المباراة وملف اللاعب والمكالمات. الخادم يثبت صاحب الرسالة أو المشاركة في المكالمة؛ المكالمات لا تُسجّل. مرفقات الرسائل المبلغ عنها تبقى داخل صندوق الإدارة.
- مراجعة البلاغات ومحاولات التلاعب، عقوبات حساب/تواصل/اقتصاد بمدة ساعة أو يوم أو أسبوع أو 30 يومًا أو دائمة، وسجل قرارات واعتراضات ورفع عقوبات. الاشتباه وحده لا ينشئ حظرًا تلقائيًا.

## الإدارة والتشغيل

حساب الإدارة الحالي هو Gojo، معرف 40. افتح **الإعدادات ← الحساب ← السلامة والإبلاغ ← مراجعة البلاغات**. لا يُؤخذ دور الإدارة من العميل أو اسم قابل للتغيير، بل من معرف الحساب المسجل في القاعدة. إعداد البريد في `MODERATION_EMAILS` داخل `.env`؛ لا تحفظ بيانات SMTP أو JWT أو مفاتيح التوقيع في Git.

الإشعارات محفوظة في صندوق إرسال بقاعدة البيانات، وتُعاد المحاولة عند الفشل. البريد يحمل رقم البلاغ وبيانات مختصرة؛ تفاصيل الدليل داخل صندوق الإدارة فقط. لا تختبر البلاغات الوهمية على قاعدة الإنتاج.

## Enforcement

Wallet balances, purchases, ownership, claims, puzzle ratings and rewards are server-owned. Puzzle sessions verify each solution move; hints/errors settle rated attempts once, and opening another rated puzzle settles an abandoned active attempt. Battle puzzle selection and scoring are server-owned. Engine/Nour rewards require the actual server opponent transcript. Offline gameplay and display progress remain available; offline, altered or undone games cannot mint verified account rewards.

Online/LAN moves are replayed against legal chess rules and the server clock. Client victory claims cannot create wins. Existing sockets and authenticated HTTP requests enforce restrictions. Password reset increments the token version. JWT has no development-secret fallback. Public assets use an explicit allowlist: database, source, diagnostics, credentials and signing files are not served or packaged. Android backups are disabled.

## Google Play Integrity

The Android `AppIntegrity` plugin requests a Google verdict with a server nonce. The server decodes it using Google credentials and verifies the package, timestamp, recognized app and signing certificate. Challenges are account-bound and single-use; verified passes expire after one hour.

Configure `PLAY_INTEGRITY_PROJECT_NUMBER`, `PLAY_INTEGRITY_CERT_SHA256` (comma-separated URL-safe base64 certificate SHA-256 digests from the Play verdict), and Google Application Default Credentials with the Play Integrity API enabled and access to the linked project. Use the **Play app signing certificate**, which may differ from the upload certificate. Set `PLAY_INTEGRITY_ENFORCE=1` only after testing an eligible Play distribution. Enforcement fails closed if configuration is missing. With enforcement disabled, GitHub APK and browser/offline play remain usable.

Play configuration is currently unavailable and enforcement remains disabled. A local checksum, root flag, or report count is not proof of a hacked APK. Bundled puzzle solutions can be read by determined automated clients. Server validation reduces abuse; it cannot promise perfect anti-cheat or Google Play approval.

## Validation

Isolated integration coverage: reward spoofing/replay, legal Stockfish sessions, legal online mate, false results, forged cosmetics, trusted game-message identity, active socket restriction, puzzle/battle scoring, report participation/group membership, restricted attachments, owner authorization, sanctions/appeals/expiry, token invalidation, durable two-recipient mail retry, home quest caps/reset and account isolation. Existing economy, store, mission, call and privacy regressions are retained. SMTP authentication is checked without sending a fake production report.

UI checked in Arabic/English at 320, 360 and 768 CSS px, including theme changes and the permanent-penalty confirmation. These are browser viewport checks; no physical handset was connected. Signed APK/AAB builds and dependency audit are checked separately.

Production session signing was migrated from the known legacy fallback to a private local key. Existing sessions must sign in again once; account data and owned items are preserved. Firebase Admin uses the current modular app/auth/messaging API.
