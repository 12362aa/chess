package com.amkh.chess;

import android.Manifest;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.*;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(
    name = "NearbyConnect",
    permissions = {
        @Permission(strings = {Manifest.permission.ACCESS_FINE_LOCATION}, alias = "location"),
        @Permission(strings = {Manifest.permission.ACCESS_COARSE_LOCATION}, alias = "coarseLocation"),
        @Permission(strings = {Manifest.permission.BLUETOOTH_SCAN}, alias = "bluetoothScan"),
        @Permission(strings = {Manifest.permission.BLUETOOTH_ADVERTISE}, alias = "bluetoothAdvertise"),
        @Permission(strings = {Manifest.permission.BLUETOOTH_CONNECT}, alias = "bluetoothConnect"),
        @Permission(strings = {"android.permission.NEARBY_WIFI_DEVICES"}, alias = "nearbyWifi")
    }
)
public class NearbyPlugin extends Plugin {
    private static final String TAG = "NearbyPlugin";
    private static final String SERVICE_ID = "com.amkh.chess.nearby";
    private static final Strategy STRATEGY = Strategy.P2P_STAR;
    
    private String connectedEndpointId = null;
    private Map<String, String> discoveredEndpoints = new HashMap<>();
    private boolean isAdvertising = false;
    private boolean isDiscovering = false;

    private final ConnectionLifecycleCallback connectionLifecycleCallback = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(String endpointId, ConnectionInfo connectionInfo) {
            Log.d(TAG, "Connection initiated from: " + connectionInfo.getEndpointName());
            // Auto-accept all connections
            Nearby.getConnectionsClient(getActivity())
                .acceptConnection(endpointId, payloadCallback);
            
            JSObject data = new JSObject();
            data.put("endpointId", endpointId);
            data.put("endpointName", connectionInfo.getEndpointName());
            notifyListeners("connectionInitiated", data);
        }

        @Override
        public void onConnectionResult(String endpointId, ConnectionResolution result) {
            JSObject data = new JSObject();
            data.put("endpointId", endpointId);
            
            if (result.getStatus().isSuccess()) {
                connectedEndpointId = endpointId;
                stopAdvertisingInternal();
                stopDiscoveringInternal();
                data.put("connected", true);
                Log.d(TAG, "Connected to: " + endpointId);
            } else {
                data.put("connected", false);
                Log.d(TAG, "Connection failed to: " + endpointId);
            }
            notifyListeners("connectionResult", data);
        }

        @Override
        public void onDisconnected(String endpointId) {
            connectedEndpointId = null;
            JSObject data = new JSObject();
            data.put("endpointId", endpointId);
            notifyListeners("disconnected", data);
            Log.d(TAG, "Disconnected from: " + endpointId);
        }
    };

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override
        public void onPayloadReceived(String endpointId, Payload payload) {
            if (payload.getType() == Payload.Type.BYTES) {
                byte[] bytes = payload.asBytes();
                if (bytes != null) {
                    String message = new String(bytes, StandardCharsets.UTF_8);
                    JSObject data = new JSObject();
                    data.put("endpointId", endpointId);
                    data.put("message", message);
                    notifyListeners("messageReceived", data);
                    Log.d(TAG, "Received: " + message);
                }
            }
        }

        @Override
        public void onPayloadTransferUpdate(String endpointId, PayloadTransferUpdate update) {
            // Not needed for small byte payloads
        }
    };

    @PluginMethod
    public void startAdvertising(PluginCall call) {
        String name = call.getString("name", "Chess Player");
        
        // Check and request permissions first
        if (!allPermissionsGranted()) {
            requestAllPermissions(call, "permissionCallback");
            return;
        }
        
        doStartAdvertising(call, name);
    }
    
    private boolean allPermissionsGranted() {
        try {
            return getPermissionState("location") == com.getcapacitor.PermissionState.GRANTED;
        } catch(Exception e) {
            return false;
        }
    }
    
    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        String method = call.getMethodName();
        if ("startAdvertising".equals(method)) {
            String name = call.getString("name", "Chess Player");
            doStartAdvertising(call, name);
        } else if ("startDiscovering".equals(method)) {
            doStartDiscovering(call);
        }
    }
    
    private void doStartAdvertising(PluginCall call, String name) {
        AdvertisingOptions options = new AdvertisingOptions.Builder()
                .setStrategy(STRATEGY)
                .build();

        Nearby.getConnectionsClient(getActivity())
            .startAdvertising(name, SERVICE_ID, connectionLifecycleCallback, options)
            .addOnSuccessListener(unused -> {
                isAdvertising = true;
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Advertising started as: " + name);
            })
            .addOnFailureListener(e -> {
                Log.e(TAG, "Advertising failed", e);
                call.reject("Failed to start advertising: " + e.getMessage());
            });
    }

    @PluginMethod
    public void startDiscovering(PluginCall call) {
        if (!allPermissionsGranted()) {
            requestAllPermissions(call, "permissionCallback");
            return;
        }
        doStartDiscovering(call);
    }
    
    private void doStartDiscovering(PluginCall call) {
        discoveredEndpoints.clear();
        
        EndpointDiscoveryCallback discoveryCallback = new EndpointDiscoveryCallback() {
            @Override
            public void onEndpointFound(String endpointId, DiscoveredEndpointInfo info) {
                discoveredEndpoints.put(endpointId, info.getEndpointName());
                JSObject data = new JSObject();
                data.put("endpointId", endpointId);
                data.put("endpointName", info.getEndpointName());
                notifyListeners("endpointFound", data);
                Log.d(TAG, "Found endpoint: " + info.getEndpointName() + " (" + endpointId + ")");
            }

            @Override
            public void onEndpointLost(String endpointId) {
                discoveredEndpoints.remove(endpointId);
                JSObject data = new JSObject();
                data.put("endpointId", endpointId);
                notifyListeners("endpointLost", data);
                Log.d(TAG, "Lost endpoint: " + endpointId);
            }
        };

        DiscoveryOptions options = new DiscoveryOptions.Builder()
                .setStrategy(STRATEGY)
                .build();

        Nearby.getConnectionsClient(getActivity())
            .startDiscovery(SERVICE_ID, discoveryCallback, options)
            .addOnSuccessListener(unused -> {
                isDiscovering = true;
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
                Log.d(TAG, "Discovery started");
            })
            .addOnFailureListener(e -> {
                Log.e(TAG, "Discovery failed", e);
                call.reject("Failed to start discovery: " + e.getMessage());
            });
    }

    @PluginMethod
    public void requestConnection(PluginCall call) {
        String endpointId = call.getString("endpointId");
        String name = call.getString("name", "Chess Player");
        
        if (endpointId == null) {
            call.reject("endpointId is required");
            return;
        }

        Nearby.getConnectionsClient(getActivity())
            .requestConnection(name, endpointId, connectionLifecycleCallback)
            .addOnSuccessListener(unused -> {
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            })
            .addOnFailureListener(e -> {
                call.reject("Connection request failed: " + e.getMessage());
            });
    }

    @PluginMethod
    public void sendMessage(PluginCall call) {
        String message = call.getString("message");
        String targetEndpointId = call.getString("endpointId", connectedEndpointId);
        
        if (message == null || targetEndpointId == null) {
            call.reject("message and connected endpoint are required");
            return;
        }

        byte[] bytes = message.getBytes(StandardCharsets.UTF_8);
        Payload payload = Payload.fromBytes(bytes);

        Nearby.getConnectionsClient(getActivity())
            .sendPayload(targetEndpointId, payload)
            .addOnSuccessListener(unused -> {
                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            })
            .addOnFailureListener(e -> {
                call.reject("Send failed: " + e.getMessage());
            });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        if (connectedEndpointId != null) {
            Nearby.getConnectionsClient(getActivity())
                .disconnectFromEndpoint(connectedEndpointId);
            connectedEndpointId = null;
        }
        stopAdvertisingInternal();
        stopDiscoveringInternal();
        
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
    
    @PluginMethod
    public void stopAll(PluginCall call) {
        stopAdvertisingInternal();
        stopDiscoveringInternal();
        if (connectedEndpointId != null) {
            Nearby.getConnectionsClient(getActivity())
                .disconnectFromEndpoint(connectedEndpointId);
            connectedEndpointId = null;
        }
        Nearby.getConnectionsClient(getActivity()).stopAllEndpoints();
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    private void stopAdvertisingInternal() {
        if (isAdvertising) {
            Nearby.getConnectionsClient(getActivity()).stopAdvertising();
            isAdvertising = false;
        }
    }

    private void stopDiscoveringInternal() {
        if (isDiscovering) {
            Nearby.getConnectionsClient(getActivity()).stopDiscovery();
            isDiscovering = false;
        }
    }
}
