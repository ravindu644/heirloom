package io.github.ravindu644.heirloom;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * Where a countdown button lands. It draws nothing and is gone at once. With the app up, the act
 * goes to the page's own code, which writes the timer as a tap in the app would, and the screen
 * stays as it was. With the app gone, it opens the app, which does the act as it starts: a tap is
 * never dropped, and nothing but the app's own code ever writes the timer.
 */
public class ActionActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String act = getIntent().getStringExtra(CountdownPlugin.ACT);
        String run = getIntent().getStringExtra(CountdownPlugin.RUN);
        if (act != null && !CountdownPlugin.deliver(act, run)) {
            Intent open = new Intent(this, MainActivity.class)
                .putExtra(CountdownPlugin.ACT, act)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            if (run != null) open.putExtra(CountdownPlugin.RUN, run);
            startActivity(open);
        }
        finish();
    }
}
