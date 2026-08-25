package com.amkh.chess;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * RingtonePlugin — تشغيل نغمة رنين النظام (اللي المستخدم مختارها في الإعدادات)
 * داخل التطبيق وقت المكالمة الواردة والتطبيق مفتوح، زيّ واتساب (#157). نظير الجزء
 * الأصلي في FcmService (حالة التطبيق مقفول) بس هنا نشغّلها بأنفسنا عبر
 * android.media.Ringtone بدل نغمة Web Audio — والصوت الأصلي مش خاضع لسياسة
 * WebView في منع التشغيل التلقائي فبيشتغل دايمًا حتى لو AudioContext معلّق.
 */
@CapacitorPlugin(name = "Ringtone")
public class RingtonePlugin extends Plugin {

    private Ringtone ringtone;
    private Vibrator vibrator;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;

    // watchdog لإعادة التشغيل على أندرويد < 9 (قبل توفّر Ringtone.setLooping)
    private final Handler loopHandler = new Handler(Looper.getMainLooper());
    private Runnable loopWatchdog;
    private boolean ringing = false;

    @PluginMethod
    public void start(PluginCall call) {
        final boolean vibrate = Boolean.TRUE.equals(call.getBoolean("vibrate", true));
        synchronized (this) {
            stopInternal(); // حالة نظيفة حتى لو اتنادت مرتين

            Context ctx = getContext();

            // نغمة الرنين المختارة في إعدادات النظام — نفس الـAPI المستخدَم في FcmService
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (uri == null) { call.reject("no-default-ringtone"); return; }

            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)      // مجرى الرنين + مستوى صوت الرنين
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();

            audioManager = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            requestAudioFocus(attrs);   // يوقف موسيقى المستخدم وقت الرنين (زي واتساب)

            ringtone = RingtoneManager.getRingtone(ctx, uri);
            if (ringtone == null) { abandonAudioFocus(); call.reject("cannot-load-ringtone"); return; }
            ringtone.setAudioAttributes(attrs);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {   // API 28+: تكرار أصلي
                ringtone.setLooping(true);
            }
            ringtone.play();
            ringing = true;

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {    // أقل من 28: إعادة تشغيل يدوية
                startLoopWatchdog();
            }
            if (vibrate) startVibration(ctx);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        synchronized (this) { stopInternal(); }
        call.resolve();
    }

    // ── بؤرة الصوت (Audio focus) ──
    private void requestAudioFocus(AudioAttributes attrs) {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {   // API 26+
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attrs)
                    .build();
            audioManager.requestAudioFocus(focusRequest);
        } else {
            audioManager.requestAudioFocus(null, AudioManager.STREAM_RING, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest != null) { audioManager.abandonAudioFocusRequest(focusRequest); focusRequest = null; }
        } else {
            audioManager.abandonAudioFocus(null);
        }
    }

    // ── اهتزاز زيّ المكالمة ──
    private void startVibration(Context ctx) {
        if (audioManager != null && audioManager.getRingerMode() == AudioManager.RINGER_MODE_SILENT) return; // احترم الصامت

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {   // API 31+
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = (vm != null) ? vm.getDefaultVibrator() : null;
        } else {
            vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        }
        if (vibrator == null || !vibrator.hasVibrator()) return;

        long[] pattern = {0, 700, 700, 700, 700}; // نفس نمط FcmService، يتكرّر من البداية (repeat=0)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {   // API 26+
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    // ── watchdog التكرار قبل أندرويد 9 ──
    private void startLoopWatchdog() {
        stopLoopWatchdog();
        loopWatchdog = new Runnable() {
            @Override public void run() {
                synchronized (RingtonePlugin.this) {
                    if (!ringing || ringtone == null) return;
                    try { if (!ringtone.isPlaying()) ringtone.play(); } catch (Exception ignored) {}
                    loopHandler.postDelayed(this, 800);
                }
            }
        };
        loopHandler.postDelayed(loopWatchdog, 800);
    }

    private void stopLoopWatchdog() {
        if (loopWatchdog != null) { loopHandler.removeCallbacks(loopWatchdog); loopWatchdog = null; }
    }

    // ── إيقاف كامل ونظيف ──
    private void stopInternal() {
        ringing = false;
        stopLoopWatchdog();
        if (ringtone != null) {
            try { if (ringtone.isPlaying()) ringtone.stop(); } catch (Exception ignored) {}
            ringtone = null;   // نفضّي المرجع بعد الإيقاف
        }
        if (vibrator != null) {
            try { vibrator.cancel(); } catch (Exception ignored) {}
            vibrator = null;
        }
        abandonAudioFocus();
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) { stopInternal(); }   // ما نسيبش رنين شغّال لو الـActivity اتقفلت
        super.handleOnDestroy();
    }
}
