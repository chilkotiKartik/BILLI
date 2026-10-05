package com.billi.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.text.TextUtils;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "BilliNative")
public class BilliNativePlugin extends Plugin {

    @PluginMethod
    public void startFocus(PluginCall call) {
        JSArray blocked = call.getArray("blockedPackages");
        SharedPreferences prefs = getContext().getSharedPreferences(AppBlockerService.PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putBoolean(AppBlockerService.KEY_FOCUS_ACTIVE, true);

        Set<String> set = new HashSet<>();
        if (blocked != null) {
            for (int i = 0; i < blocked.length(); i++) {
                try {
                    set.add(blocked.getString(i));
                } catch (Exception ignored) {}
            }
        }
        editor.putStringSet(AppBlockerService.KEY_BLOCKED_PACKAGES, set);
        editor.apply();

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("message", "Focus mode and app lock activated.");
        call.resolve(ret);
    }

    @PluginMethod
    public void stopFocus(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(AppBlockerService.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(AppBlockerService.KEY_FOCUS_ACTIVE, false).apply();

        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("message", "Focus mode ended. Apps unlocked.");
        call.resolve(ret);
    }

    @PluginMethod
    public void isAccessibilityEnabled(PluginCall call) {
        String service = getContext().getPackageName() + "/" + AppBlockerService.class.getCanonicalName();
        boolean enabled = false;
        try {
            int accessibilityEnabled = Settings.Secure.getInt(
                getContext().getContentResolver(),
                Settings.Secure.ACCESSIBILITY_ENABLED
            );
            if (accessibilityEnabled == 1) {
                String settingValue = Settings.Secure.getString(
                    getContext().getContentResolver(),
                    Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
                );
                if (settingValue != null) {
                    TextUtils.SimpleStringSplitter splitter = new TextUtils.SimpleStringSplitter(':');
                    splitter.setString(settingValue);
                    while (splitter.hasNext()) {
                        String accessService = splitter.next();
                        if (accessService.equalsIgnoreCase(service)) {
                            enabled = true;
                            break;
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        List<ApplicationInfo> packages = pm.getInstalledApplications(PackageManager.GET_META_DATA);
        JSArray list = new JSArray();

        for (ApplicationInfo packageInfo : packages) {
            // Filter out internal system framework packages
            if ((packageInfo.flags & ApplicationInfo.FLAG_SYSTEM) == 0 || packageInfo.packageName.contains("youtube") || packageInfo.packageName.contains("chrome")) {
                if (!packageInfo.packageName.equals(getContext().getPackageName())) {
                    JSObject item = new JSObject();
                    item.put("packageName", packageInfo.packageName);
                    item.put("appName", pm.getApplicationLabel(packageInfo).toString());
                    list.put(item);
                }
            }
        }

        JSObject ret = new JSObject();
        ret.put("apps", list);
        call.resolve(ret);
    }

    @PluginMethod
    public void scheduleExactAlarm(PluginCall call) {
        int id = call.getInt("id", (int) System.currentTimeMillis());
        Long timeMs = call.getLong("timeMs");
        String title = call.getString("title", "Billi Study Alarm");
        String message = call.getString("message", "Time for your study session!");

        if (timeMs == null || timeMs <= System.currentTimeMillis()) {
            call.reject("Invalid alarm time");
            return;
        }

        AlarmManager alarmManager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        Intent intent = new Intent(getContext(), AlarmReceiver.class);
        intent.putExtra("title", title);
        intent.putExtra("message", message);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            getContext(),
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        if (alarmManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timeMs, pendingIntent);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, timeMs, pendingIntent);
            }
        }

        JSObject ret = new JSObject();
        ret.put("scheduled", true);
        ret.put("id", id);
        call.resolve(ret);
    }
}
