package com.amkh.chess;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * خدمة FCM مخصّصة (#151).
 *
 * بترث خدمة إضافة Capacitor للإشعارات وتفوّض ليها كل الرسايل العادية
 * (شات/نور/دعوات) عبر {@code super.onMessageReceived} — فمفيش أي تغيير في
 * سلوك الإشعارات الحالية ولا في تسجيل التوكِن (onNewToken موروث زي ما هو).
 *
 * الفرق الوحيد: لما توصل رسالة data فيها {@code kind=call} (السيرفر بيبعتها
 * data-only للمكالمة الواردة والتطبيق مقفول)، بنبني إشعار مكالمة واردة بأزرار
 * «رد/رفض» + واجهة ملء الشاشة على قناة عالية الأهمية، زيّ واتساب.
 */
public class FcmService extends MessagingService {

    public static final String CALL_CHANNEL_ID = "chess-call";
    public static final int CALL_NOTIF_ID = 42101;
    public static final String ACTION_REJECT = "com.amkh.chess.CALL_REJECT";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String kind = data != null ? data.get("kind") : null;
        if ("call".equals(kind)) {
            try {
                showCallNotification(data);
            } catch (Exception e) {
                // لو حصل أي خطأ في بناء إشعار المكالمة، رجّع للسلوك الافتراضي.
                super.onMessageReceived(remoteMessage);
            }
            return;
        }
        // كل الإشعارات التانية: سلوك Capacitor الأصلي بدون تغيير.
        super.onMessageReceived(remoteMessage);
    }

    private void showCallNotification(Map<String, String> data) {
        String fromName = data.get("from_name");
        if (fromName == null || fromName.isEmpty()) fromName = data.get("title");
        if (fromName == null || fromName.isEmpty()) fromName = "صديق";
        String group = data.get("group");
        boolean isGroup = group != null && !group.isEmpty() && !"null".equals(group);
        String fromId = data.get("from_id");
        String callId = data.get("call_id");
        String callType = data.get("call_type");
        boolean isVideo = "video".equals(callType);
        String rejectToken = data.get("reject_token");
        String acceptToken = data.get("accept_token");

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureCallChannel(nm);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        // «رد» / نقر الإشعار / ملء الشاشة → افتح التطبيق ورُدّ فعليًا. أول ما
        // يفتح، سوكت الحضور بيتصل والداعي بيعيد الدعوة كل 3ث؛ call-client بيلقط
        // نية الرد (CallIntent) ويقبل المكالمة تلقائيًا بدل ما يسيبها بترنّ (#159).
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openIntent.putExtra("call_action", "answer");
        if (fromId != null) openIntent.putExtra("call_from", fromId);
        if (callId != null) openIntent.putExtra("call_id", callId);
        openIntent.putExtra("call_type", isVideo ? "video" : "audio");
        if (acceptToken != null) openIntent.putExtra("accept_token", acceptToken);
        PendingIntent openPi = PendingIntent.getActivity(this, 1001, openIntent, piFlags);

        // «رفض» → broadcast بيلغي الإشعار وكمان يبعت رفضًا فعليًا للداعي عبر
        // reject_token الموقّع (POST /api/call/reject) فيتوقف الرنين عنده فورًا (#159).
        Intent rejectIntent = new Intent(this, CallActionReceiver.class);
        rejectIntent.setAction(ACTION_REJECT);
        if (fromId != null) rejectIntent.putExtra("call_from", fromId);
        if (rejectToken != null) rejectIntent.putExtra("reject_token", rejectToken);
        PendingIntent rejectPi = PendingIntent.getBroadcast(this, 1002, rejectIntent, piFlags);

        String subtitle = isVideo
                ? (isGroup ? "مكالمة فيديو من حفلة" : "مكالمة فيديو واردة")
                : (isGroup ? "مكالمة حفلة واردة" : "مكالمة صوتية واردة");

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle(fromName)
                .setContentText(subtitle)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setContentIntent(openPi)
                .setFullScreenIntent(openPi, true)
                .addAction(0, "رفض", rejectPi)
                .addAction(0, "رد", openPi);

        // قبل أندرويد 8 الصوت بيتحط على الإشعار نفسه (مفيش قنوات).
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (ring != null) b.setSound(ring);
            b.setVibrate(new long[]{0, 700, 700, 700, 700});
        }

        nm.notify(CALL_NOTIF_ID, b.build());
    }

    private void ensureCallChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (nm.getNotificationChannel(CALL_CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
                CALL_CHANNEL_ID, "مكالمات واردة", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("إشعار المكالمات الصوتية الواردة");
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        Uri ring = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (ring != null) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            ch.setSound(ring, attrs);
        }
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 700, 700, 700, 700});
        nm.createNotificationChannel(ch);
    }
}
