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
       من --kb عشان الصندوق يلزق في الكيبورد تمامًا على أي جهاز (أزرار/إيماءات/دوران). */
    private void setupNavBarInset() {
        final WebView web = (getBridge() != null) ? getBridge().getWebView() : null;
        if (web == null) return;
        // تحديث فوري لو الـinsets اتغيّرت وقت التشغيل (دوران/تبديل نمط التنقّل).
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            injectNavInset(web);
            return insets;   // مانستهلكش الـinsets — نعيدها زي ما هي عشان مانكسرش أي معالجة تانية
        });
    }

    /* بيقرأ ارتفاع شريط التنقّل من WindowInsets الحيّة ويحقنه في صفحة التطبيق.
       مش بيعتمد على توقيت أي callback — بيقرأ القيمة الحالية، فبيشتغل حتى بعد ما
       الصفحة يُعاد تحميلها (اللي بيمسح المتغيّر لو اتحقن قبل ما الصفحة تجهز). */
    private void injectNavInset(final WebView web) {
        if (web == null) return;
        WindowInsetsCompat wi = ViewCompat.getRootWindowInsets(web);
        if (wi == null) return;
        float density = getResources().getDisplayMetrics().density;
        final int navCss = Math.round(wi.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom / (density <= 0 ? 1f : density));
        web.evaluateJavascript(
            "document.documentElement&&document.documentElement.style.setProperty('--nav-bottom','" + navCss + "px')", null);
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
