package com.amkh.chess;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
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
