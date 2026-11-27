package io.github.ravindu644.heirloom;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The bell's and a called lap's exact alarms, and boot and update: alarms do not survive a reboot. */
public class Receiver extends BroadcastReceiver {

    static final String BELL = "io.github.ravindu644.heirloom.BELL";
    static final String CALL = "io.github.ravindu644.heirloom.CALL";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (BELL.equals(action)) Shade.rang(context, intent);
        else if (CALL.equals(action)) Shade.called(context, intent);
        else if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Shade.rearm(context);
            KeepService.sync(context);
        }
    }
}
