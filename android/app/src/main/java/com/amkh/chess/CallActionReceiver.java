package com.amkh.chess;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * زر «رفض» في إشعار المكالمة الواردة (#151 → #159).
 *
 * قديمًا كان بيلغي الإشعار بس، والداعي يفضل رانن لحد المهلة (التطبيق مقفول
 * فمفيش سوكت للرد الفوري). دلوقتي بيبعت رفضًا فعليًا: الإشعار بيحمل
 * reject_token موقّعًا من السيرفر، فبنعمل POST على /api/call/reject في خيط
 * خلفي، والسيرفر يرحّل call:reject لسوكتات الداعي فيتوقف الرنين عنده فورًا.
 */
public class CallActionReceiver extends BroadcastReceiver {

    // مصدر رابط السيرفر الحيّ — نفس اللي بيقراه التطبيق في index.html.
    private static final String URL_JSON = "https://raw.githubusercontent.com/12362aa/chess/main/url.json";
    private static final String FALLBACK_BASE = "https://chess-amkh.onrender.com";

    @Override
    public void onReceive(Context context, Intent intent) {
        // ألغِ الإشعار فورًا (مش حرج لو الشبكة فشلت بعدها).
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(FcmService.CALL_NOTIF_ID);
        } catch (Exception ignored) {}

        final String token = intent != null ? intent.getStringExtra("reject_token") : null;
        if (token == null || token.isEmpty()) return; // مافيش توكيع → رجوع للسلوك القديم (إلغاء الإشعار بس).

        // POST في خيط خلفي مع goAsync عشان الـReceiver ما يتقتلش قبل ما ينتهي الطلب.
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try {
                postReject(fetchServerBase(), token);
            } catch (Exception ignored) {
            } finally {
                pr.finish();
            }
        }).start();
    }

    /** يقرأ رابط السيرفر الحيّ من url.json (نفس مصدر التطبيق)، مع fallback ثابت. */
    private String fetchServerBase() {
        HttpURLConnection c = null;
        try {
            URL u = new URL(URL_JSON + "?t=" + System.currentTimeMillis());
            c = (HttpURLConnection) u.openConnection();
            c.setConnectTimeout(5000);
            c.setReadTimeout(5000);
            c.setRequestProperty("ngrok-skip-browser-warning", "true");
            if (c.getResponseCode() == 200) {
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = r.readLine()) != null) sb.append(line);
                r.close();
                String txt = sb.toString().replace("﻿", "").trim();
                String url = new JSONObject(txt).optString("url", "").trim();
                if (!url.isEmpty()) return url.replaceAll("/+$", "");
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) try { c.disconnect(); } catch (Exception ignored) {}
        }
        return FALLBACK_BASE;
    }

    private void postReject(String base, String token) {
        HttpURLConnection c = null;
        try {
            URL u = new URL(base + "/api/call/reject");
            c = (HttpURLConnection) u.openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(6000);
            c.setReadTimeout(6000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("ngrok-skip-browser-warning", "true");
            byte[] out = new JSONObject().put("token", token).toString().getBytes("UTF-8");
            OutputStream os = c.getOutputStream();
            os.write(out);
            os.close();
            c.getResponseCode(); // ينفّذ الطلب فعليًا
        } catch (Exception ignored) {
        } finally {
            if (c != null) try { c.disconnect(); } catch (Exception ignored) {}
        }
    }
}
