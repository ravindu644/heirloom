package io.github.ravindu644.heirloom;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The time left in the phase, live in the notification shade. Android draws the countdown itself
 * from `end`, so nothing of ours runs while it shows, and it takes itself away at the end.
 * Java, not Kotlin: the app module is Java and stays free of the Kotlin plugin.
 */
@CapacitorPlugin(name = "Countdown")
public class CountdownPlugin extends Plugin {

    // Apart from the bell, which is id 1 (RING_ID in client/src/platform/capacitor.ts).
    private static final int ID = 7400;

    @PluginMethod
    public void show(PluginCall call) {
        String title = call.getString("title");
        String channel = call.getString("channel");
        long end = call.getData().optLong("end", 0);
        long left = end - System.currentTimeMillis();
        if (title == null || channel == null || left <= 0) {
            call.reject("countdown needs a title, a channel and an end in the future");
            return;
        }
        Context context = getContext();
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent tap = PendingIntent.getActivity(context, ID, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_stat_heirloom)
            .setColor(ContextCompat.getColor(context, R.color.you))
            .setContentTitle(title)
            .setWhen(end)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setTimeoutAfter(left)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(tap);
        try {
            NotificationManagerCompat.from(context).notify(ID, builder.build());
        } catch (SecurityException e) {
            // No permission to notify yet. The bell's own check says so; the countdown just is not shown.
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(ID);
        call.resolve();
    }
}
