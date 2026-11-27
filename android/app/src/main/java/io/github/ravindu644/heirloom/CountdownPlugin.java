package io.github.ravindu644.heirloom;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * The page's one way to the phone's drawer (Shade): the timer it plans, the called lap, and what
 * the background service needs. And the way back: the countdown's buttons only carry the person's
 * tap to the app, whose own code is the one writer of the timer (see ActionActivity).
 * Java, not Kotlin: the app module is Java and stays free of the Kotlin plugin.
 */
@CapacitorPlugin(name = "Countdown")
public class CountdownPlugin extends Plugin {

    static final String ACT = "io.github.ravindu644.heirloom.ACT";
    // The timer's run the button was drawn for, so the app can drop a tap on a stale notification.
    static final String RUN = "io.github.ravindu644.heirloom.RUN";

    // The plugin of the app that is up now, with its WebView; null while there is none.
    private static CountdownPlugin live;

    @Override
    public void load() {
        live = this;
        // Opened by a button while the app was not up: the act waits for the page's listener.
        // MainActivity has already taken the act out of an intent that is being replayed (opened
        // from Recents, or restored after the process was killed); the history flag is checked here
        // too, as it is the one of the two a plugin can see.
        Intent intent = getActivity().getIntent();
        if (intent != null && (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0) carry(intent);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        carry(intent);
    }

    @Override
    protected void handleOnDestroy() {
        if (live == this) live = null;
    }

    private void carry(Intent intent) {
        // A room's note or call was tapped: the page opens the Room.
        String to = intent == null ? null : intent.getStringExtra(Shade.OPEN);
        if (to != null) {
            intent.removeExtra(Shade.OPEN);
            JSObject data = new JSObject();
            data.put("to", to);
            notifyListeners("open", data, true);
        }
        String act = intent == null ? null : intent.getStringExtra(ACT);
        if (act == null) return;
        String run = intent.getStringExtra(RUN);
        forget(intent);
        tell(act, run);
    }

    /** Takes a carried tap out of an intent, so this process never does it twice. */
    static void forget(Intent intent) {
        intent.removeExtra(Shade.OPEN);
        intent.removeExtra(ACT);
        intent.removeExtra(RUN);
    }

    private void tell(String act, String run) {
        JSObject data = new JSObject();
        data.put("act", act);
        data.put("run", run == null ? JSONObject.NULL : run);
        // Kept until the page listens, so an act that comes in before it does is not dropped.
        notifyListeners("action", data, true);
    }

    /** Hands a tapped act to the app if it is up. False when it is not: the caller opens it. */
    static boolean deliver(String act, String run) {
        CountdownPlugin plugin = live;
        if (plugin == null || plugin.getBridge() == null || plugin.getBridge().getWebView() == null) return false;
        plugin.tell(act, run);
        return true;
    }

    /** The timer as the page knows it: its stamp, the cell's value, and what planFor made of it. Answers whether Android will ring it. */
    @PluginMethod
    public void plan(PluginCall call) {
        JSObject d = call.getData();
        String stamp = d.isNull("stamp") ? "" : d.optString("stamp");
        JSObject answer = new JSObject();
        answer.put("rings", Shade.offer(getContext(), stamp, d.optJSONObject("state"), d.optJSONObject("ring"), true, d.optBoolean("off")));
        call.resolve(answer);
    }

    /** The soonest called lap you are in: id, at (this phone's time), title, body. Nothing given takes it off. */
    @PluginMethod
    public void call(PluginCall call) {
        JSObject d = call.getData();
        Shade.call(getContext(), d.has("id") ? d : null, true);
        call.resolve();
    }

    /** What the background service needs (ARCHITECTURE section 6). Nothing given is a sign-out: stop, wipe. */
    @PluginMethod
    public void keep(PluginCall call) {
        JSObject d = call.getData();
        Shade.keep(getContext(), d.has("server") ? d : null);
        call.resolve();
    }

    /** Whether Android lets heirloom run in the background unrestricted: out of battery optimisation. */
    @PluginMethod
    public void background(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject answer = new JSObject();
        answer.put("unrestricted", pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(answer);
    }

    /** Android's own request to let heirloom run unrestricted, from a tap in Settings only. */
    @PluginMethod
    public void askUnrestricted(PluginCall call) {
        Intent ask = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
        try {
            getActivity().startActivity(ask);
        } catch (ActivityNotFoundException e) {
            // A phone without the request: the list it lives in, where the person finds heirloom.
            getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
        call.resolve();
    }
}
