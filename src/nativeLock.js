import { NativeModules } from 'react-native';

const L = NativeModules.StudyLock || {};

export async function isDeviceAdminActive() { return L.isAdmin ? L.isAdmin() : false; }
export async function requestDeviceAdmin() { return L.requestAdmin ? L.requestAdmin() : false; }
export async function lockScreen() { return L.lock ? L.lock() : 'pin'; }
export async function unlockScreen() { return L.unlock ? L.unlock() : false; }
export async function getInstalledApps() { return L.getApps ? L.getApps() : []; }
export async function setLockTaskWhitelist(pkgs) { return L.setWhitelist ? L.setWhitelist(pkgs) : false; }
