import { NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const L = NativeModules.StudyLock;

export async function isDeviceAdminActive() {
  if (!L?.isAdmin) return false;
  try { return await L.isAdmin(); } catch (e) { return false; }
}

export async function requestDeviceAdmin() {
  if (!L?.requestAdmin) return false;
  try { await L.requestAdmin(); return true; } catch (e) { return false; }
}

export async function isAccessibilityEnabled() {
  if (!L?.isAccessibilityEnabled) return false;
  try { return await L.isAccessibilityEnabled(); } catch (e) { return false; }
}

export async function openAccessibilitySettings() {
  if (!L?.openAccessibilitySettings) return;
  try { await L.openAccessibilitySettings(); } catch (e) {}
}

export async function openWhiteListSettings() {
  if (!L?.openWhiteListSettings) return;
  try { await L.openWhiteListSettings(); } catch (e) {}
}

export async function lockScreen() {
  if (!L?.lock) return 'none';
  try {
    // Sync whitelist before locking
    const pkgs = JSON.parse(await AsyncStorage.getItem('wl_pkgs') || '[]');
    if (L.setWhitelist) await L.setWhitelist(pkgs);
    return await L.lock();
  } catch (e) { return 'error'; }
}

export async function unlockScreen() {
  if (!L?.unlock) return false;
  try { await L.unlock(); return true; } catch (e) { return false; }
}

export async function getInstalledApps() {
  if (!L?.getApps) return [];
  try { return await L.getApps(); } catch (e) { return []; }
}

export async function showDynamicIsland(title, body) {
  if (L?.showDynamicIsland) try { await L.showDynamicIsland(title, body); } catch (e) {}
}

export async function saveWhitelist(pkgs) {
  await AsyncStorage.setItem('wl_pkgs', JSON.stringify(pkgs));
  if (L?.setWhitelist) await L.setWhitelist(pkgs);
}
