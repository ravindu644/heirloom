package io.github.ravindu644.heirloom;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import org.json.JSONObject;

/**
 * The bell you hear and feel. The phone plays it itself rather than through the notification's
 * channel: a channel's sound follows the ringer, and DESIGN.md's "Ring even on silent" must come
 * through Mute, as an alarm does. The bell's notification makes no sound of its own.
 */
final class Bell {

    /** DESIGN.md, "The bell": 400 ms, a 200 ms rest, 400 ms, 200 ms, 150 ms. Two long, one short. */
    static final long[] BUZZ = { 0, 400, 200, 400, 200, 150 };

    private static MediaPlayer player;
    private static AudioFocusRequest focus;
    private static BroadcastReceiver.PendingResult holding;

    private Bell() {}

    /** On silent too (an alarm), or following the phone's mode (a notification). */
    static int usage(boolean silent) {
        return silent ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION_EVENT;
    }

    /** Whether the bell buzzes: `vibrate` from the page's settings, on unless switched off. */
    static boolean buzzes(JSONObject settings) {
        return settings == null || settings.optBoolean("vibrate", true);
    }

    static boolean silent(JSONObject settings) {
        return settings == null || settings.optBoolean("silent", true);
    }

    private static int clip(String sound) {
        if ("struck".equals(sound)) return R.raw.bell_struck;
        if ("chime".equals(sound)) return R.raw.bell_chime;
        return R.raw.bell_school;
    }

    /**
     * Rings once with `settings` ({ sound, vibrate, silent }; null for the defaults). `hold` is the
     * receiver's pending result, finished when the clip ends or is hushed, so the process lives
     * as long as the bell does.
     */
    static synchronized void ring(Context c, JSONObject settings, BroadcastReceiver.PendingResult hold) {
        hush(c);
        holding = hold;
        boolean loud = silent(settings);
        AudioAttributes attrs = new AudioAttributes.Builder().setUsage(usage(loud)).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        AudioManager am = c.getSystemService(AudioManager.class);
        // Transient and may duck: music playing goes quiet under the bell and comes back after it.
        if (Build.VERSION.SDK_INT >= 26) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(attrs).build();
            am.requestAudioFocus(focus);
        }
        player = MediaPlayer.create(c, clip(settings == null ? null : settings.optString("sound")), attrs, am.generateAudioSessionId());
        if (player == null) {
            // No clip: the buzz alone, left to run its 1.35 s.
            hush(c);
            if (buzzes(settings)) buzz(c, attrs);
            return;
        }
        if (buzzes(settings)) buzz(c, attrs);
        player.setOnCompletionListener(p -> hush(c));
        player.start();
    }

    /** One bell from Settings, as a notification sounds: it follows the phone's mode and does not buzz. */
    static void preview(Context c, String sound) {
        try {
            ring(c, new JSONObject().put("sound", sound).put("vibrate", false).put("silent", false), null);
        } catch (org.json.JSONException ignored) {
            // put never throws for these values.
        }
    }

    // Alarm usage when the bell rings on silent, so the buzz comes through Mute with it.
    @SuppressWarnings("deprecation")
    private static void buzz(Context c, AudioAttributes attrs) {
        Vibrator v = c.getSystemService(Vibrator.class);
        if (v == null || !v.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(BUZZ, -1), attrs);
        else v.vibrate(BUZZ, -1, attrs);
    }

    /** Stops the bell: tapped, swiped away, answered, the app opened, or the clip at its end. */
    static synchronized void hush(Context c) {
        if (player != null) {
            player.release();
            player = null;
        }
        // Always: a buzz runs on its own, also when the clip could not be made.
        Vibrator v = c.getSystemService(Vibrator.class);
        if (v != null) v.cancel();
        if (focus != null) {
            c.getSystemService(AudioManager.class).abandonAudioFocusRequest(focus);
            focus = null;
        }
        if (holding != null) {
            holding.finish();
            holding = null;
        }
    }
}
