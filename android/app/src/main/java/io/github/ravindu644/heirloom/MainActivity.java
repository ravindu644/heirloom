package io.github.ravindu644.heirloom;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CountdownPlugin.class);
        super.onCreate(savedInstanceState);
        // The debug build's pages come from https://localhost and its server is the laptop's
        // http://localhost:8787. Chromium counts loopback as trustworthy, so this should not be
        // needed; it is here so a WebView that disagrees cannot block the morning's device check.
        // Release builds talk https to https and never reach this line.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0 && bridge != null) {
            bridge.getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }
}
