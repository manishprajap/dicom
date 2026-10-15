package io.ionic.starter;

import android.os.Bundle;
import android.webkit.PermissionRequest;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SftpPlugin.class);
        super.onCreate(savedInstanceState);

        // FIX (part 1): previously this replaced the WebView's
        // WebChromeClient with a brand new plain android.webkit.WebChromeClient.
        // That silently discarded Capacitor's BridgeWebChromeClient, which is
        // what implements onShowFileChooser() — the callback that actually
        // opens the native file/gallery picker for <input type="file">. With
        // a plain WebChromeClient, the click did nothing and produced no
        // error or logcat output, because the default (no-op) implementation
        // of onShowFileChooser() just does nothing. Extending
        // BridgeWebChromeClient instead keeps every other Capacitor-provided
        // behavior (including onShowFileChooser) intact, while still letting
        // us override onPermissionRequest exactly as before.
        //
        // FIX (part 2): BridgeWebChromeClient's constructor internally calls
        // bridge.registerForActivityResult(), and Android requires that this
        // registration happen before the Activity reaches STARTED —
        // effectively, synchronously inside onCreate(). The original code
        // wrapped construction in getWebView().post(...), which defers it to
        // the next Looper iteration — by then onCreate() has already
        // returned and the Activity is RESUMED, causing a crash:
        // "LifecycleOwner ... is attempting to register while current state
        // is RESUMED." Removing the post() and setting it directly here,
        // still inside onCreate(), fixes that crash.
        this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Forcefully grant camera/audio permissions inside WebView UI
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });
    }
}