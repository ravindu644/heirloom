package io.github.ravindu644.heirloom;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // A tap carried in by a countdown button is done once. Android keeps the intent that opened
        // the task and hands it back when the activity is restored after the process was killed, or
        // reopened from Recents: then the tap is old, and is dropped before the plugin sees it.
        boolean replayed = savedInstanceState != null || (getIntent().getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
        if (replayed) CountdownPlugin.forget(getIntent());
        registerPlugin(CountdownPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // On screen, the page already says what a room notification would.
    @Override
    public void onResume() {
        super.onResume();
        Shade.front = true;
    }

    @Override
    public void onPause() {
        Shade.front = false;
        super.onPause();
    }
}
