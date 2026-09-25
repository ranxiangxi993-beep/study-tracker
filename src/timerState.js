export const TIMER_STATE_KEY = "active_timer_v2";
export const TIMER_INTERRUPT_EVENT = "study-timer-interrupted";

export function elapsedSeconds(timer, now = Date.now()) {
  if (!timer) return 0;
  const elapsed =
    Math.max(0, timer.elapsed || 0) +
    (timer.paused ? 0 : Math.max(0, (now - timer.startedAt) / 1000));
  return Math.floor(
    timer.countUp ? elapsed : Math.min(timer.duration, elapsed),
  );
}
export function remainingSeconds(timer, now = Date.now()) {
  return Math.max(0, timer.duration - elapsedSeconds(timer, now));
}
export function parseTimer(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      !["work", "short", "long"].includes(value.mode) ||
      !Number.isFinite(value.duration) ||
      value.duration <= 0 ||
      !Number.isFinite(value.startedAt) ||
      !Number.isFinite(value.elapsed) ||
      value.elapsed < 0
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function pauseTimer(timer, now = Date.now()) {
  return {
    ...timer,
    elapsed: elapsedSeconds(timer, now),
    startedAt: now,
    paused: true,
    notificationId: null,
  };
}
export function resumeTimer(timer, now = Date.now()) {
  return { ...timer, startedAt: now, paused: false };
}
