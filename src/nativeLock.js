import { NativeModules, Platform } from 'react-native';

const StudyLock = NativeModules.StudyLock || {};

export async function isDeviceAdminActive() {
  if (!StudyLock.isDeviceAdminActive) return false;
  return StudyLock.isDeviceAdminActive();
}

export async function requestDeviceAdmin() {
  if (!StudyLock.requestDeviceAdmin) return false;
  return StudyLock.requestDeviceAdmin();
}

export async function lockScreen() {
  if (!StudyLock.lockScreen) return 'locked_pin'; // fallback
  return StudyLock.lockScreen();
}

export async function unlockScreen() {
  if (!StudyLock.unlockScreen) return false;
  return StudyLock.unlockScreen();
}

export async function getInstalledApps() {
  if (!StudyLock.getInstalledApps) return [];
  return StudyLock.getInstalledApps();
}

export async function setLockTaskWhitelist(packages) {
  if (!StudyLock.setLockTaskWhitelist) return false;
  return StudyLock.setLockTaskWhitelist(packages);
}
