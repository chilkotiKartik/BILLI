// Bridge to Native Android Capabilities (App Blocker, Exact Alarms, Installed Apps)
const isCapacitor = () => typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform();

export const BilliNative = {
  isNative: isCapacitor,

  async isAccessibilityEnabled() {
    if (!isCapacitor()) return false;
    try {
      const res = await window.Capacitor.Plugins.BilliNative.isAccessibilityEnabled();
      return !!res.enabled;
    } catch {
      return false;
    }
  },

  async openAccessibilitySettings() {
    if (!isCapacitor()) return;
    try {
      await window.Capacitor.Plugins.BilliNative.openAccessibilitySettings();
    } catch {}
  },

  async getInstalledApps() {
    if (!isCapacitor()) return [];
    try {
      const res = await window.Capacitor.Plugins.BilliNative.getInstalledApps();
      return res.apps || [];
    } catch {
      return [];
    }
  },

  async startFocus(blockedPackages = []) {
    if (!isCapacitor()) return;
    try {
      await window.Capacitor.Plugins.BilliNative.startFocus({ blockedPackages });
    } catch {}
  },

  async stopFocus() {
    if (!isCapacitor()) return;
    try {
      await window.Capacitor.Plugins.BilliNative.stopFocus();
    } catch {}
  },

  async scheduleExactAlarm(id, timeMs, title, message) {
    if (!isCapacitor()) return;
    try {
      await window.Capacitor.Plugins.BilliNative.scheduleExactAlarm({ id, timeMs, title, message });
    } catch {}
  }
};
