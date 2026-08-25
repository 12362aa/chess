package com.amkh.chess;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import androidx.annotation.RequiresApi;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * توجيه صوت المكالمة بين سماعة الأذن ومكبّر الصوت (#158).
 *
 * WebView على أندرويد مابيدعمش setSinkId() (قيد في أندرويد: مافيش أجهزة إخراج
 * في enumerateDevices)، فالتحكم في وجهة الصوت لازم يكون أصلي عبر AudioManager:
 *   - API 31+  : setCommunicationDevice(TYPE_BUILTIN_SPEAKER / EARPIECE)
 *   - أقدم     : setSpeakerphoneOn(true/false) [مهمل لكنه يعمل]
 * في الحالتين لازم MODE_IN_COMMUNICATION عشان الصوت يمشي في مسار مكالمة VoIP
 * (سماعة الأذن افتراضيًا + معالجة صدى عتادية)، ونرجّعه MODE_NORMAL عند الإنهاء.
 */
@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {

    private AudioManager audioManager;

    @Override
    public void load() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    /** on=true → مكبر الصوت، on=false → سماعة الأذن. بيضبط وضع الاتصال أول مرة. */
    @PluginMethod
    public void setSpeaker(PluginCall call) {
        if (audioManager == null) { call.reject("AudioManager unavailable"); return; }
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));

        if (audioManager.getMode() != AudioManager.MODE_IN_COMMUNICATION) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        }

        boolean ok;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ok = routeApi31(on);
        } else {
            audioManager.setSpeakerphoneOn(on);
            ok = true;
        }

        JSObject ret = new JSObject();
        ret.put("success", ok);
        ret.put("speaker", on);
        call.resolve(ret);
    }

    /** تهيئة وضع المكالمة بدون تغيير الوجهة (سماعة أذن افتراضيًا). */
    @PluginMethod
    public void startCallAudio(PluginCall call) {
        if (audioManager == null) { call.reject("AudioManager unavailable"); return; }
        if (audioManager.getMode() != AudioManager.MODE_IN_COMMUNICATION) {
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            routeApi31(false);
        } else {
            audioManager.setSpeakerphoneOn(false);
        }
        call.resolve();
    }

    /** تنظيف إلزامي عند انتهاء المكالمة: رجوع للوضع الطبيعي. */
    @PluginMethod
    public void reset(PluginCall call) {
        if (audioManager == null) { call.reject("AudioManager unavailable"); return; }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice();
            } else {
                audioManager.setSpeakerphoneOn(false);
            }
            audioManager.setMode(AudioManager.MODE_NORMAL);
        } catch (Exception e) { /* تجاهُل */ }
        call.resolve();
    }

    @RequiresApi(api = Build.VERSION_CODES.S)
    private boolean routeApi31(boolean speaker) {
        int targetType = speaker
                ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
        for (AudioDeviceInfo d : audioManager.getAvailableCommunicationDevices()) {
            if (d.getType() == targetType) {
                return audioManager.setCommunicationDevice(d);
            }
        }
        // بعض الأجهزة (اللوحية) بلا سماعة أذن → اترك النظام يوجّه تلقائيًا
        if (!speaker) {
            audioManager.clearCommunicationDevice();
            return true;
        }
        return false;
    }
}
