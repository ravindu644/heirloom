package io.github.ravindu644.heirloom;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CountdownPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
