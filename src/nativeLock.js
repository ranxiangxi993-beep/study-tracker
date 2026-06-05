import { NativeModules, Alert } from 'react-native';
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

export async function lockScreen() {
  if (!L?.lock) return 'none';
  // Sync whitelist from AsyncStorage to native SharedPreferences before locking
  try {
    const pkgs = JSON.parse(await AsyncStorage.getItem('wl_pkgs') || '[]');
    if (L.setWhitelist) await L.setWhitelist(pkgs);
  } catch (_) {}
  try { return await L.lock(); } catch (e) { return 'error'; }
}

export async function unlockScreen() {
  if (!L?.unlock) return false;
  try { await L.unlock(); return true; } catch (e) { return false; }
}

export async function getInstalledApps() {
  if (!L?.getApps) return [];
  try { return await L.getApps(); } catch (e) { return []; }
}

export async function saveWhitelist(pkgs) {
  await AsyncStorage.setItem('wl_pkgs', JSON.stringify(pkgs));
  if (L?.setWhitelist) await L.setWhitelist(pkgs);
}

