package com.amkh.chess;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * توجيه صوت المكالمة بين سماعة الأذن ومكبّر الصوت (#158 + إصلاح العلّة ٨).
 *
 * WebView مابيدعمش setSinkId()، فالتوجيه لازم يكون أصلي عبر AudioManager:
 *   - API 31+  : setCommunicationDevice(TYPE_BUILTIN_SPEAKER / EARPIECE)
 *   - أقدم     : setSpeakerphoneOn(true/false) [مهمل لكنه يعمل]
 * في الحالتين لازم MODE_IN_COMMUNICATION عشان الصوت يمشي في مسار مكالمة VoIP.
 *
 * ليه كان الزر «وهمي» قبل كده — وإزاي اتصلّح:
 *   ١) على جهاز بلا سماعة أذن (تابلت) الكود القديم كان بينده
 *      clearCommunicationDevice() ويرجّع success=true، فالواجهة تقول «سماعة»
 *      والصوت طالع من المكبّر. بقى بيرجّع hasEarpiece=false والواجهة تخفي الزر.
 *   ٢) Chromium نفسه بيضبط وضع الصوت والسبيكر لما جلسة WebRTC تبدأ، فبيلغي
 *      اختيارنا لو اتنفّذ قبله. بقى فيه إعادة تثبيت مؤجّلة + مراقبة تغيّر
 *      الوضع/الأجهزة، وبنتحقّق من الوجهة الفعلية بعد كل محاولة.
 *   ٣) الحالة الراجعة للواجهة بقت من الجهاز الفعلي (getCommunicationDevice)
 *      مش من نيّتنا، فالزر بيعرض الحقيقة دايمًا.
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private AudioManager am;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private boolean wantSpeaker = false;
    private boolean callActive = false;
    private Object focusReq;      // AudioFocusRequest (API 26+)
    private Object devCb;         // AudioDeviceCallback (API 23+)
    private Object modeCb;        // OnModeChangedListener (API 31+)

    @Override
    public void load() {
        am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }
    /* ═══════════ الواجهة المتاحة لجافاسكربت ═══════════ */

    /** يبدأ مسار صوت المكالمة (وضع VoIP + تركيز صوتي + توجيه أوّلي). */
    @PluginMethod
    public void startCallAudio(PluginCall call) {
        if (am == null) { call.reject("no-audio-manager"); return; }
        Boolean spk = call.getBoolean("speaker", Boolean.FALSE);
        wantSpeaker = Boolean.TRUE.equals(spk);
        callActive = true;
        requestFocus();
        enterCommMode();
        applyRoute();
        registerWatchers();
        scheduleReassert();
        call.resolve(state());
    }

    /** يوجّه الصوت للمكبّر (on=true) أو لسماعة الأذن (on=false) — بلا كذب. */
    @PluginMethod
    public void setSpeaker(PluginCall call) {
        if (am == null) { call.reject("no-audio-manager"); return; }
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", Boolean.FALSE));
        /* جهاز بلا سماعة أذن: مانقدرش ننزل عن المكبّر، فبنقول الحقيقة */
        if (!on && !hasEarpiece()) {
            JSObject r = state();
            r.put("success", false);
            r.put("reason", "no-earpiece");
            call.resolve(r);
            return;
        }
        wantSpeaker = on;
        callActive = true;
        enterCommMode();
        boolean applied = applyRoute();
        scheduleReassert();
        JSObject r = state();
        r.put("success", applied && actualSpeaker() == on);
        call.resolve(r);
    }

    /** الحالة الفعلية للتوجيه (الواجهة بتعتمد عليها مش على نيّتها). */
    @PluginMethod
    public void getRoute(PluginCall call) {
        if (am == null) { call.reject("no-audio-manager"); return; }
        call.resolve(state());
    }

    /** يرجّع كل حاجة لوضعها الطبيعي بعد إنهاء المكالمة. */
    @PluginMethod
    public void reset(PluginCall call) {
        callActive = false;
        wantSpeaker = false;
        ui.removeCallbacksAndMessages(null);
        unregisterWatchers();
        if (am != null) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    am.clearCommunicationDevice();
                } else {
                    am.setSpeakerphoneOn(false);
                }
            } catch (Throwable ignore) { }
            try { am.setMode(AudioManager.MODE_NORMAL); } catch (Throwable ignore) { }
        }
        abandonFocus();
        if (call != null) call.resolve(state());
    }

    /* ═══════════ التوجيه الفعلي ═══════════ */

    private void enterCommMode() {
        try {
            if (am.getMode() != AudioManager.MODE_IN_COMMUNICATION) {
                am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            }
        } catch (Throwable ignore) { }
    }

    /** ينفّذ التوجيه المطلوب ويرجّع true لو النظام قَبِله فعلًا. */
    private boolean applyRoute() {
        if (am == null) return false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return routeApi31(wantSpeaker);
            am.setSpeakerphoneOn(wantSpeaker);
            return am.isSpeakerphoneOn() == wantSpeaker;
        } catch (Throwable t) {
            return false;
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.S)
    private boolean routeApi31(boolean speaker) {
        int want = speaker ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
        AudioDeviceInfo target = null;
        for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
            if (d.getType() == want) { target = d; break; }
        }
        /* الوجهة المطلوبة مش موجودة → مانرجّعش نجاح كاذب */
        if (target == null) return false;
        return am.setCommunicationDevice(target);
    }

    /* ═══════════ قراءة الحالة الحقيقية ═══════════ */

    /** الصوت طالع من المكبّر فعلًا؟ (مقروء من النظام مش من نيّتنا) */
    private boolean actualSpeaker() {
        if (am == null) return false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AudioDeviceInfo d = am.getCommunicationDevice();
                if (d != null) return d.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;
            }
            return am.isSpeakerphoneOn();
        } catch (Throwable t) {
            return false;
        }
    }

    /** الجهاز فيه سماعة أذن؟ التابلت غالبًا لأ، فالزر مالوش معنى. */
    private boolean hasEarpiece() {
        if (am == null) return false;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                    if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return true;
                }
                return false;
            }
            for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                if (d.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return true;
            }
        } catch (Throwable ignore) { }
        return false;
    }

    private String deviceName() {
        if (am == null) return "";
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AudioDeviceInfo d = am.getCommunicationDevice();
                if (d != null) return String.valueOf(d.getType());
            }
        } catch (Throwable ignore) { }
        return actualSpeaker() ? "speaker" : "earpiece";
    }

    private JSObject state() {
        JSObject o = new JSObject();
        boolean real = actualSpeaker();
        o.put("speaker", real);
        o.put("wanted", wantSpeaker);
        o.put("hasEarpiece", hasEarpiece());
        o.put("device", deviceName());
        o.put("mode", am != null ? am.getMode() : 0);
        o.put("active", callActive);
        o.put("available", true);
        return o;
    }

    /* ═══════════ إعادة التثبيت ضد Chromium ═══════════ */

    /**
     * Chromium بيضبط الوضع/السبيكر لوحده عند بداية جلسة WebRTC، وساعات
     * بعد ما ننفّذ اختيارنا بشويّة. فبنعيد التثبيت على فترات ونبلّغ الواجهة.
     */
    private void scheduleReassert() {
        for (int ms : new int[]{ 300, 900, 1800, 3200 }) {
            ui.postDelayed(this::reassert, ms);
        }
    }

    private void reassert() {
        if (!callActive || am == null) return;
        if (actualSpeaker() != wantSpeaker) {
            enterCommMode();
            applyRoute();
        }
        notifyRoute();
    }

    private void notifyRoute() {
        try { notifyListeners("routeChanged", state()); } catch (Throwable ignore) { }
    }

    private void registerWatchers() {
        if (am == null) return;
        if (devCb == null) {
            AudioDeviceCallback cb = new AudioDeviceCallback() {
                @Override public void onAudioDevicesAdded(AudioDeviceInfo[] added) { onDevices(); }
                @Override public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) { onDevices(); }
            };
            try { am.registerAudioDeviceCallback(cb, ui); devCb = cb; } catch (Throwable ignore) { }
        }
        if (modeCb == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                AudioManager.OnModeChangedListener l = mode -> ui.postDelayed(this::reassert, 120);
                am.addOnModeChangedListener(getContext().getMainExecutor(), l);
                modeCb = l;
            } catch (Throwable ignore) { }
        }
    }

    private void onDevices() {
        if (!callActive) return;
        ui.postDelayed(this::reassert, 150);
        ui.postDelayed(this::reassert, 700);
    }

    private void unregisterWatchers() {
        if (am == null) return;
        if (devCb instanceof AudioDeviceCallback) {
            try { am.unregisterAudioDeviceCallback((AudioDeviceCallback) devCb); } catch (Throwable ignore) { }
        }
        devCb = null;
        if (modeCb != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try { am.removeOnModeChangedListener((AudioManager.OnModeChangedListener) modeCb); } catch (Throwable ignore) { }
        }
        modeCb = null;
    }

    /* ═══════════ التركيز الصوتي ═══════════ */

    /** بلا تركيز صوتي بمسار مكالمة، النظام ساعات بيرجّع التوجيه للميديا. */
    private void requestFocus() {
        if (am == null || focusReq != null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes at = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();
                AudioFocusRequest r = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(at)
                        .setOnAudioFocusChangeListener(f -> { }, ui)
                        .build();
                am.requestAudioFocus(r);
                focusReq = r;
            } else {
                am.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN);
                focusReq = Boolean.TRUE;
            }
        } catch (Throwable ignore) { }
    }

    private void abandonFocus() {
        if (am == null || focusReq == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusReq instanceof AudioFocusRequest) {
                am.abandonAudioFocusRequest((AudioFocusRequest) focusReq);
            } else {
                am.abandonAudioFocus(null);
            }
        } catch (Throwable ignore) { }
        focusReq = null;
    }

    @Override
    protected void handleOnDestroy() {
        reset(null);
    }
}
