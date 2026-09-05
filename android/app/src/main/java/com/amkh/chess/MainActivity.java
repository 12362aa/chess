package com.amkh.chess;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NearbyPlugin.class);
        registerPlugin(AudioRoutePlugin.class);   // #158: توجيه صوت المكالمة (سبيكر/سماعة)
        registerPlugin(RingtonePlugin.class);      // #157: نغمة رنين النظام داخل التطبيق
        registerPlugin(CallIntentPlugin.class);    // #159: جسر نية «الرد» من الإشعار
        registerPlugin(MediaSavePlugin.class);     // #6: حفظ وسائط الدردشة في المعرض
        super.onCreate(savedInstanceState);
        handleCallIntent(getIntent());             // إقلاع بارد من زر «رد» في الإشعار
        setupNavBarInset();                        // #140: احقن ارتفاع شريط التنقّل لـCSS
    }

    /* #140: keyboardHeight من إضافة @capacitor/keyboard = قيمة الـime inset مقيسة
       من أسفل النافذة الكاملة (DecorView يملأ الشاشة)، فبتشمل ارتفاع شريط التنقّل
       السفلي (nav bar) رغم إن الـWebView ما بيمتدش خلفه (بينتهي عند قمة الشريط).
       فلو رفعنا الأوراق/شات اللعبة بالقيمة الكاملة، يفضل فراغ أسود بمقدار nav bar
       بين صندوق الكتابة والكيبورد (اللي اشتكى منه أحمد). بنقيس ارتفاع الشريط من
       WindowInsets ونحقنه كـ--nav-bottom بالبكسل المنطقي (CSS px)، والـJS بيطرحه
       من --kb عشان الصندوق يلزق في الكيبورد تمامًا على أي جهاز (أزرار/إيماءات/دوران).

       وبنحقن كذلك --kb-native: التغطية الفعلية للكيبورد جوّه الـWebView. راجع
       injectInsets تحت — دي اللي أنهت عطل الشات على التابلت نهائيًا. */
    private void setupNavBarInset() {
        final WebView web = (getBridge() != null) ? getBridge().getWebView() : null;
        if (web == null) return;
        /* الاستماع على DecorView (جذر التوزيع) لا على الـWebView:
           • أي أب في الشجرة يستهلك الـinsets (كابستور بيعمل كده لإدارة
             edge-to-edge) كان بيمنع listener الـWebView من العمل أصلًا — فيفضل
             --kb-native على قيمته القديمة (صفر) وقت فتح الكيبورد، والنتيجة
             كيبورد بيغطّي صندوق الكتابة على الهاتف (بلاغ أحمد، بناء 29).
           • ولأن setOnApplyWindowInsetsListener بيستبدل معالج العنصر، كان
             تسجيلنا على الـWebView بيلغي معالج كابستور نفسه. هنا بنعيد
             ViewCompat.onApplyWindowInsets عشان التوزيع الطبيعي يكمل كما هو. */
        final View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            injectNavInset(web);
            web.post(() -> injectNavInset(web));
            return ViewCompat.onApplyWindowInsets(v, insets);
        });
        // الكيبورد بيقلّص الـWebView (أندرويد ١٥+) فالقياس الصحيح وقته هو بعد
        // الـlayout الجديد بالضبط — أدقّ توقيت متاح، وبيلقط الدوران كذلك.
        web.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or2, ob) -> injectNavInset(web));
    }

    /* بيقرأ ارتفاع شريط التنقّل وتغطية الكيبورد من WindowInsets الحيّة ويحقنهم في
       صفحة التطبيق. مش بيعتمد على توقيت أي callback — بيقرأ القيمة الحالية، فبيشتغل
       حتى بعد ما الصفحة يُعاد تحميلها (اللي بيمسح المتغيّر لو اتحقن قبل ما الصفحة تجهز).

       --kb-native = كم بكسلًا من صفحتنا يغطّيه الكيبورد فعلًا = تقاطع مستطيل
       الـWebView مع منطقة الـIME:
           التغطية = قاع الـWebView على الشاشة − قمّة الكيبورد على الشاشة
       الصيغة دي صحيحة على كل الحالات بلا أي كشف ولا تخزين ولا تخصيص لجهاز:
       • أندرويد ١٤ وأقل (WebView بينتهي عند قمّة شريط التنقّل): = ime − nav
       • أندرويد ١٥+ (Capacitor بيحطّ padding=ime على حاوية الـWebView فيتقلّص): = صفر
       • edge-to-edge بلا تقليص (الـWebView لقاع الشاشة): = ime كامل
       • كيبورد التابلت العائم/المقسوم: النظام مابيبلّغش له ime inset → = صفر
       الحالة الأخيرة هي اللي كانت مكسورة: التقدير القديم (ارتفاع الكيبورد من
       البلاجن ناقص تقليص متوقَّع) كان بيفتح فراغًا بمقدار كيبورد مش مغطّي
       أصلًا، ويقصّ الترويسة. القياس المباشر مايغلطش فيها. */
    private void injectNavInset(final WebView web) {
        if (web == null) return;
        WindowInsetsCompat wi = ViewCompat.getRootWindowInsets(web);
        if (wi == null) return;
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0) density = 1f;
        final int navCss = Math.round(wi.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom / density);

        int ime = wi.getInsets(WindowInsetsCompat.Type.ime()).bottom;
        int coveredPx = 0;
        if (ime > 0) {
            try {
                int[] loc = new int[2];
                web.getLocationOnScreen(loc);
                int webBottom = loc[1] + web.getHeight();
                View decor = getWindow().getDecorView();
                int[] dloc = new int[2];
                decor.getLocationOnScreen(dloc);
                int winBottom = dloc[1] + decor.getHeight();
                coveredPx = Math.max(0, webBottom - (winBottom - ime));
            } catch (Exception e) { coveredPx = 0; }
        }
        final int kbCss = Math.round(coveredPx / density);
        final int imeOn = (ime > 0) ? 1 : 0;
        /* بلا ذاكرة مؤقّتة عن قصد: أي تحميل جديد للصفحة بيمسح متغيّرات CSS، فلو
           تخطّينا الحقن لأن القيمة «زي ما هي» تفضل الصفحة بلا --kb-native وتسقط
           على التقدير القديم. نداء JS بسيط زي ده أرخص من عطل في الشات.
           imeOn بيقول للصفحة: هل النظام بيبلّغ إزاحة كيبورد وقت القياس ده؟ لو لا
           (أندرويد ٢٩ وأقل مثلًا) فالصفر مش دليل على عدم التغطية، والصفحة تسقط
           على تقديرها بدل ما تفضل ملزوقة على صفر خاطئ. */
        web.evaluateJavascript(
            "(function(d){if(!d)return;d.style.setProperty('--nav-bottom','" + navCss + "px');"
            + "d.style.setProperty('--kb-native','" + kbCss + "px');"
            + "if(window.AMKH_kbNative)window.AMKH_kbNative(" + kbCss + "," + imeOn + ");})(document.documentElement)", null);
    }

    @Override
    public void onResume() {
        super.onResume();
        final WebView web = (getBridge() != null) ? getBridge().getWebView() : null;
        if (web == null) return;
        // أول رسم للنافذة بيحصل قبل ما صفحة index.html تخلّص تحميل، والريلود بيمسح
        // المتغيّر. نعيد الحقن على فترات عشان نضمن إنه يثبت على documentElement
        // النهائي بتاع صفحة التطبيق — حتى على أبطأ إقلاع.
        long[] delays = { 300, 900, 1800, 3200 };
        for (long d : delays) web.postDelayed(() -> injectNavInset(web), d);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCallIntent(intent);                  // التطبيق مفتوح والضغط على «رد»
    }

    /* «رد» في إشعار المكالمة بيفتح التطبيق بـextras فيها هوية المكالمة (#159).
       بنمرّرها لـCallIntent، وcall-client بيلقطها ويقبل المكالمة تلقائيًا. */
    private void handleCallIntent(Intent intent) {
        if (intent == null) return;
        if (!"answer".equals(intent.getStringExtra("call_action"))) return;
        String from = intent.getStringExtra("call_from");
        if (from == null || from.isEmpty()) return;
        // #159: ألغِ إشعار المكالمة فورًا عشان مايفضلش معروض بعد الضغط على «رد».
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(FcmService.CALL_NOTIF_ID);
        } catch (Exception e) {}
        CallIntentPlugin.deliver(from, intent.getStringExtra("call_id"),
                intent.getStringExtra("call_type"), intent.getStringExtra("accept_token"));
    }
}
