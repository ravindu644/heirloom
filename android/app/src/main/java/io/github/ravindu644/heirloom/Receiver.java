package io.github.ravindu644.heirloom;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The bell's and a called lap's exact alarms, and boot and update: alarms do not survive a reboot. */
public class Receiver extends BroadcastReceiver {

    static final String BELL = "io.github.ravindu644.heirloom.BELL";
    static final String CALL = "io.github.ravindu644.heirloom.CALL";
    static final String HUSH = "io.github.ravindu644.heirloom.HUSH";
    /** "I'm in" or "I'm out" on a new call's notification. */
    static final String IN = "io.github.ravindu644.heirloom.IN";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        // The bell holds the receiver for as long as it sounds, a few seconds, so the process lives through it.
        if (BELL.equals(action)) Shade.rang(context, intent, goAsync());
        else if (HUSH.equals(action)) Bell.hush(context);
        else if (IN.equals(action)) {
            PendingResult hold = goAsync();
            KeepService.in(context, intent.getStringExtra("room"), intent.getStringExtra("call"), intent.getBooleanExtra("in", true), (status) -> {
                Shade.answered(context, intent, status);
                hold.finish();
            });
        }
        else if (CALL.equals(action)) Shade.called(context, intent);
        else if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Shade.rearm(context);
            KeepService.sync(context);
        }
    }
}
