import { NativeModules, Alert } from 'react-native';

const L = NativeModules.StudyLock;

// Show diagnostic if module missing
if (!L) {
  console.warn('StudyLock native module not found!');
}

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

export async function setLockTaskWhitelist(pkgs) {
  if (!L?.setWhitelist) return false;
  try { await L.setWhitelist(pkgs); return true; } catch (e) { return false; }
}
