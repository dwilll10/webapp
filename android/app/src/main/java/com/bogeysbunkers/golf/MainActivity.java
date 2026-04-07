package com.bogeysbunkers.golf;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Prevent WebView from extending behind the status bar
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
