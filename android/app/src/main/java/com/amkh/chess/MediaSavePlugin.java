package com.amkh.chess;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * MediaSavePlugin — حفظ صور/فيديو/صوت الدردشة في ذاكرة الجهاز (#6).
 *
 * الضغط المطوّل على وسائط الدردشة كان لا يقدّم أي طريقة للحفظ، لأن روابط
 * data: لا تُنزَّل داخل الـWebView. هذه الإضافة تكتب البايتات بنفسها:
 *
 *  • أندرويد 10 (API 29) وأحدث: تُدرَج في MediaStore داخل مجلد عام
 *    (Pictures/Movies/Music ← AmkhChess) فتظهر في معرض الصور مباشرة،
 *    ولا تحتاج أيّ إذن تشغيلي بفضل التخزين المُحدَّد النطاق.
 *  • ما قبل ذلك: تُكتَب في مجلد التطبيق الخارجي (لا يحتاج إذنًا كذلك)
 *    ثم نطلب من فاحص الوسائط فهرستها لتظهر في المعرض.
 */
@CapacitorPlugin(name = "MediaSave")
public class MediaSavePlugin extends Plugin {

    private static final String ALBUM = "AmkhChess";

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String mime = call.getString("mime", "");
        String name = call.getString("name", "");
        if (data == null || data.isEmpty()) {
            call.reject("no-data");
            return;
        }
        // نقبل data:URL كاملة أو base64 خالص
        int comma = data.indexOf(",");
        if (data.startsWith("data:") && comma > 0) {
            if (mime == null || mime.isEmpty()) {
                int semi = data.indexOf(";");
                int colon = data.indexOf(":");
                if (semi > colon && colon >= 0) mime = data.substring(colon + 1, semi);
            }
            data = data.substring(comma + 1);
        }
        if (mime == null) mime = "";
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("bad-base64");
            return;
        }
        if (bytes.length == 0) {
            call.reject("empty");
            return;
        }
        if (name == null || name.trim().isEmpty()) {
            name = "amkh-" + System.currentTimeMillis() + extensionFor(mime);
        }

        try {
            String uri = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                    ? saveToMediaStore(bytes, mime, name)
                    : saveToAppDir(bytes, mime, name);
            JSObject ret = new JSObject();
            ret.put("uri", uri == null ? "" : uri);
            ret.put("name", name);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "write-failed" : e.getMessage());
        }
    }

    /* أندرويد 10+: إدراج في MediaStore بمسار نسبي عام. */
    private String saveToMediaStore(byte[] bytes, String mime, String name) throws Exception {
        Context ctx = getContext();
        ContentResolver cr = ctx.getContentResolver();
        Uri collection;
        String relative;
        if (mime.startsWith("video")) {
            collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
            relative = Environment.DIRECTORY_MOVIES + File.separator + ALBUM;
        } else if (mime.startsWith("audio")) {
            collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
            relative = Environment.DIRECTORY_MUSIC + File.separator + ALBUM;
        } else {
            collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            relative = Environment.DIRECTORY_PICTURES + File.separator + ALBUM;
        }
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        if (!mime.isEmpty()) values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, relative);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri item = cr.insert(collection, values);
        if (item == null) throw new Exception("insert-failed");
        try (OutputStream out = cr.openOutputStream(item)) {
            if (out == null) throw new Exception("stream-failed");
            out.write(bytes);
            out.flush();
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        cr.update(item, values, null, null);
        return item.toString();
    }

    /* ما قبل أندرويد 10: مجلد التطبيق الخارجي + فهرسة للمعرض. */
    private String saveToAppDir(byte[] bytes, String mime, String name) throws Exception {
        Context ctx = getContext();
        String dirName = mime.startsWith("video") ? Environment.DIRECTORY_MOVIES
                : mime.startsWith("audio") ? Environment.DIRECTORY_MUSIC
                : Environment.DIRECTORY_PICTURES;
        File base = ctx.getExternalFilesDir(dirName);
        if (base == null) base = ctx.getFilesDir();
        File dir = new File(base, ALBUM);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("mkdir-failed");
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
            out.flush();
        }
        try {
            MediaScannerConnection.scanFile(ctx, new String[]{file.getAbsolutePath()},
                    mime.isEmpty() ? null : new String[]{mime}, null);
        } catch (Exception ignored) {}
        return file.getAbsolutePath();
    }

    private String extensionFor(String mime) {
        if (mime == null) return ".bin";
        if (mime.contains("png")) return ".png";
        if (mime.contains("webp")) return ".webp";
        if (mime.contains("gif")) return ".gif";
        if (mime.contains("jpeg") || mime.contains("jpg")) return ".jpg";
        if (mime.contains("mp4")) return ".mp4";
        if (mime.contains("webm")) return ".webm";
        if (mime.contains("3gp")) return ".3gp";
        if (mime.contains("ogg")) return ".ogg";
        if (mime.contains("mpeg") || mime.contains("mp3")) return ".mp3";
        if (mime.contains("m4a") || mime.contains("aac")) return ".m4a";
        if (mime.startsWith("image")) return ".jpg";
        if (mime.startsWith("video")) return ".mp4";
        if (mime.startsWith("audio")) return ".m4a";
        return ".bin";
    }
}
