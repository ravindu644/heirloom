package io.github.ravindu644.heirloom;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * The phase in the notification shade: running, a live countdown Android draws itself from `end`,
 * so nothing of ours runs while it shows and it takes itself away at the end; paused, the time
 * left standing still. Its buttons (Pause, Resume, Stop) only carry the person's tap to the app,
 * whose own code is the one writer of the timer: see ActionActivity.
 * Java, not Kotlin: the app module is Java and stays free of the Kotlin plugin.
 */
@CapacitorPlugin(name = "Countdown")
public class CountdownPlugin extends Plugin {

    // Apart from the bell, which takes ids 1 and 2 by turns (RING_ID in client/src/platform/capacitor.ts).
    private static final int ID = 7400;
    // The still form has an id of its own. The running form is posted with setTimeoutAfter, which
    // Android keeps as an alarm keyed by the notification's key; reposting that key without a
    // timeout does not take the alarm back before Android 14, so a paused notification on the same
    // id would vanish when the old lap would have ended. On its own id that alarm finds nothing.
    private static final int PAUSED_ID = 7401;
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
        String act = intent == null ? null : intent.getStringExtra(ACT);
        if (act == null) return;
        String run = intent.getStringExtra(RUN);
        forget(intent);
        tell(act, run);
    }

    /** Takes a carried tap out of an intent, so this process never does it twice. */
    static void forget(Intent intent) {
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

    @PluginMethod
    public void show(PluginCall call) {
        String title = call.getString("title");
        String channel = call.getString("channel");
        String text = call.getString("text");
        long end = call.getData().optLong("end", 0);
        long left = end - System.currentTimeMillis();
        boolean running = end > 0;
        if (title == null || channel == null || (running && left <= 0) || (!running && text == null)) {
            call.reject("countdown needs a title, a channel, and an end in the future or the time left");
            return;
        }
        Context context = getContext();
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent tap = PendingIntent.getActivity(context, ID, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_heirloom)
            .setColor(ContextCompat.getColor(context, R.color.you))
            .setContentTitle(title)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(tap);
        if (running) {
            builder.setWhen(end).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true).setTimeoutAfter(left);
        } else {
            builder.setContentText(text).setShowWhen(false);
        }
        JSArray actions = call.getArray("actions", new JSArray());
        for (int i = 0; i < actions.length(); i++) {
            JSONObject action = actions.optJSONObject(i);
            if (action == null) continue;
            String act = action.optString("act", null);
            String label = action.optString("label", null);
            String run = action.isNull("run") ? null : action.optString("run", null);
            if (act == null || label == null) continue;
            // An activity, not a broadcast: from Android 12 a receiver started by a notification may
            // not open the app, and when the app is gone, opening it is the only way the tap is done.
            Intent intent = new Intent(context, ActionActivity.class).putExtra(ACT, act).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (run != null) intent.putExtra(RUN, run);
            // One request code per act, with FLAG_UPDATE_CURRENT: a button of an older notification
            // shares its PendingIntent with the newest and so carries the newest run. That is right
            // here, since there is only ever one countdown, and the app drops a run that is not its own.
            int code = ID + 10 + ("pause".equals(act) ? 0 : "resume".equals(act) ? 1 : 2);
            PendingIntent pending = PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            builder.addAction(new NotificationCompat.Action.Builder(0, label, pending).build());
        }
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        try {
            manager.cancel(running ? PAUSED_ID : ID);
            manager.notify(running ? ID : PAUSED_ID, builder.build());
        } catch (SecurityException e) {
            // No permission to notify yet. The bell's own check says so; the countdown just is not shown.
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(ID);
        NotificationManagerCompat.from(getContext()).cancel(PAUSED_ID);
        call.resolve();
    }
}
