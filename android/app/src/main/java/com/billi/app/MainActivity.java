package com.billi.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BilliNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

