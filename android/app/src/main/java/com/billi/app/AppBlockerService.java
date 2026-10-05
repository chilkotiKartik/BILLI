package com.billi.app;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.accessibility.AccessibilityEvent;
import java.util.HashSet;
import java.util.Set;

public class AppBlockerService extends AccessibilityService {

    public static final String PREFS_NAME = "BilliBlockerPrefs";
    public static final String KEY_FOCUS_ACTIVE = "focus_active";
    public static final String KEY_BLOCKED_PACKAGES = "blocked_packages";

    private long lastTriggerTime = 0;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            CharSequence pkgName = event.getPackageName();
            if (pkgName == null) return;

            String packageName = pkgName.toString();
            if (packageName.equals(getPackageName()) || packageName.contains("launcher") || packageName.contains("systemui")) {
                return;
            }

            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean isFocusActive = prefs.getBoolean(KEY_FOCUS_ACTIVE, false);

            if (isFocusActive) {
                Set<String> blocked = prefs.getStringSet(KEY_BLOCKED_PACKAGES, new HashSet<>());
                if (blocked.contains(packageName)) {
                    long now = System.currentTimeMillis();
                    if (now - lastTriggerTime > 1500) {
                        lastTriggerTime = now;
                        launchLockScreen(packageName);
                    }
                }
            }
        }
    }

    private void launchLockScreen(String blockedPackage) {
        Intent intent = new Intent(this, LockOverlayActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);
        intent.putExtra("blocked_pkg", blockedPackage);
        startActivity(intent);
    }

    @Override
    public void onInterrupt() {}
}
