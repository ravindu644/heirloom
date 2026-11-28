package io.github.ravindu644.heirloom;

import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.os.Bundle;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Settings' "Light or dark", kept here too: the page reads its own copy only once the WebView runs.
    private static final String NIGHT = "night";

    @Override
    protected void attachBaseContext(Context base) {
        // Before AppCompat lays its night mode onto the activity, so the first frame after the splash
        // is already in the chosen theme. Without it, a phone set to Dark in a light system starts light.
        AppCompatDelegate.setDefaultNightMode(mode(base.getSharedPreferences(NIGHT, MODE_PRIVATE).getString(NIGHT, "system")));
        super.attachBaseContext(base);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // A tap carried in by a countdown button is done once. Android keeps the intent that opened
        // the task and hands it back when the activity is restored after the process was killed, or
        // reopened from Recents: then the tap is old, and is dropped before the plugin sees it.
        boolean replayed = savedInstanceState != null || (getIntent().getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
        if (replayed) CountdownPlugin.forget(getIntent());
        registerPlugin(CountdownPlugin.class);
        super.onCreate(savedInstanceState);
        bars();
    }

    /**
     * The page's theme, for the native parts. The manifest's configChanges holds uiMode, so AppCompat
     * updates this activity in place instead of recreating it: the WebView does not reload.
     */
    void night(String theme) {
        getSharedPreferences(NIGHT, MODE_PRIVATE).edit().putString(NIGHT, theme).apply();
        AppCompatDelegate.setDefaultNightMode(mode(theme));
        bars();
    }

    static int mode(String theme) {
        if ("light".equals(theme)) return AppCompatDelegate.MODE_NIGHT_NO;
        if ("dark".equals(theme)) return AppCompatDelegate.MODE_NIGHT_YES;
        return AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
    }

    static boolean dark(int mode, int systemUiMode) {
        if (mode == AppCompatDelegate.MODE_NIGHT_YES) return true;
        if (mode == AppCompatDelegate.MODE_NIGHT_NO) return false;
        return (systemUiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    // Capacitor's SystemBars sets the icons from the activity's configuration on load and on every
    // change; this runs after it and from the chosen mode, so the bars agree with the page even if
    // AppCompat's override and the system's own change cross. Resources.getSystem is the phone's
    // own setting, which AppCompat never overrides. Dark navigation icons need API 26; below it the
    // call does nothing and the system keeps its light icons on a dark bar.
    private void bars() {
        boolean dark = dark(AppCompatDelegate.getDefaultNightMode(), Resources.getSystem().getConfiguration().uiMode);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(!dark);
        bars.setAppearanceLightNavigationBars(!dark);
        // Under the page until its first paint, and after: the WebView's own default is white, a
        // flash on a dark start. This activity's resources are already in the chosen mode.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(ContextCompat.getColor(this, R.color.ground));
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        bars();
    }

    // On screen, the page already says what a room notification would.
    @Override
    public void onResume() {
        super.onResume();
        Shade.front = true;
        // Opened from the bell, or while it sounds: the person has heard it.
        Bell.hush(this);
        // The phone's own dark mode may have changed while heirloom was away.
        bars();
    }

    @Override
    public void onPause() {
        Shade.front = false;
        super.onPause();
    }
}
