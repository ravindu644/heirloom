package io.github.ravindu644.heirloom;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.res.Configuration;
import androidx.appcompat.app.AppCompatDelegate;
import org.junit.Test;

/** Settings' "Light or dark" as the bars read it: a choice holds over the system, "system" follows it. */
public class NightTest {

    private static final int SYSTEM_DARK = Configuration.UI_MODE_TYPE_NORMAL | Configuration.UI_MODE_NIGHT_YES;
    private static final int SYSTEM_LIGHT = Configuration.UI_MODE_TYPE_NORMAL | Configuration.UI_MODE_NIGHT_NO;

    @Test
    public void eachChoiceIsItsMode() {
        assertEquals(AppCompatDelegate.MODE_NIGHT_NO, MainActivity.mode("light"));
        assertEquals(AppCompatDelegate.MODE_NIGHT_YES, MainActivity.mode("dark"));
        assertEquals(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM, MainActivity.mode("system"));
        // Nothing kept yet, or a value from a later version: as the system has it.
        assertEquals(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM, MainActivity.mode(null));
        assertEquals(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM, MainActivity.mode("sepia"));
    }

    @Test
    public void lightOnADarkPhoneGivesDarkIconsAndTheOtherWayRound() {
        assertFalse(MainActivity.dark(MainActivity.mode("light"), SYSTEM_DARK));
        assertTrue(MainActivity.dark(MainActivity.mode("dark"), SYSTEM_LIGHT));
        assertTrue(MainActivity.dark(MainActivity.mode("system"), SYSTEM_DARK));
        assertFalse(MainActivity.dark(MainActivity.mode("system"), SYSTEM_LIGHT));
    }
}
