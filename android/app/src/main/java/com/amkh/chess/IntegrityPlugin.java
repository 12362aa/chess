package com.amkh.chess;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.IntegrityTokenRequest;

@CapacitorPlugin(name = "AppIntegrity")
public class IntegrityPlugin extends Plugin {
    @PluginMethod
    public void attest(PluginCall call) {
        String nonce = call.getString("nonce");
        String project = call.getString("projectNumber");
        if (nonce == null || nonce.length() > 500 || project == null) {
            call.reject("Invalid integrity challenge"); return;
        }
        try {
            IntegrityTokenRequest request = IntegrityTokenRequest.builder()
                .setNonce(nonce).setCloudProjectNumber(Long.parseLong(project)).build();
            IntegrityManagerFactory.create(getContext()).requestIntegrityToken(request)
                .addOnSuccessListener(result -> { JSObject out = new JSObject(); out.put("token", result.token()); call.resolve(out); })
                .addOnFailureListener(error -> call.reject("App verification unavailable"));
        } catch (Exception error) { call.reject("App verification unavailable"); }
    }
}
