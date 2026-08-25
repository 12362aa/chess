package com.amkh.chess;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * جسر نية «الرد» من إشعار المكالمة (#159).
 *
 * لما التطبيق يكون مقفول ويضغط المستخدم «رد» في الإشعار، بيفتح MainActivity
 * بـextras فيها (call_action=answer, call_from, call_id, call_type).
 * MainActivity بيمرّرها لهنا عبر {@link #deliver}. الـWebView (call-client.js)
 * بينده {@link #consumePending} أول ما يجهز فيلقط النية ويرد على المكالمة
 * تلقائيًا — بدل ما يفتح التطبيق ويسيبها بترنّ ويطالب المستخدم يضغط «رد» تاني.
 *
 * الحالة مخزّنة static عشان تنجو من إعادة إنشاء الـWebView وقت الإقلاع البارد،
 * وبتنتهي صلاحيتها خلال 60ث حتى ما نردّش تلقائيًا على مكالمة قديمة بالغلط.
 */
@CapacitorPlugin(name = "CallIntent")
public class CallIntentPlugin extends Plugin {

    static volatile String pendingFrom = null;
    static volatile String pendingCid = null;
    static volatile String pendingType = null;
    static volatile String pendingAccept = null;
    static volatile long pendingAt = 0L;

    static CallIntentPlugin instance;

    @Override
    public void load() { instance = this; }

    /** JS بينده دي عند الإقلاع: يرجّع نية الرد المعلّقة (لو خلال 60ث) ويستهلكها مرة واحدة. */
    @PluginMethod
    public void consumePending(PluginCall call) {
        JSObject ret = new JSObject();
        long now = System.currentTimeMillis();
        String from, cid, type, accept;
        synchronized (CallIntentPlugin.class) {
            from = pendingFrom; cid = pendingCid; type = pendingType; accept = pendingAccept;
            long at = pendingAt;
            pendingFrom = null; pendingCid = null; pendingType = null; pendingAccept = null; pendingAt = 0L;
            if (from == null || (now - at) >= 60000L) { call.resolve(ret); return; }
        }
        ret.put("from", from);
        if (cid != null) ret.put("callId", cid);
        ret.put("type", type != null ? type : "audio");
        if (accept != null) ret.put("acceptToken", accept);
        call.resolve(ret);
    }

    /** MainActivity بينده دي من الـintent؛ يخزّن النية وكمان يخطر JS فورًا لو التطبيق مفتوح. */
    static void deliver(String from, String cid, String type, String accept) {
        synchronized (CallIntentPlugin.class) {
            pendingFrom = from; pendingCid = cid; pendingType = type; pendingAccept = accept;
            pendingAt = System.currentTimeMillis();
        }
        CallIntentPlugin p = instance;
        if (p != null) {
            JSObject data = new JSObject();
            data.put("from", from);
            if (cid != null) data.put("callId", cid);
            data.put("type", type != null ? type : "audio");
            if (accept != null) data.put("acceptToken", accept);
            p.notifyListeners("callAnswer", data);
        }
    }
}
