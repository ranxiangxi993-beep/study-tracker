export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validStudyDate(value, today = dateKey()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const [year, month, day] = value.split("-").map(Number);
  return year >= 2000 && dateKey(new Date(year, month - 1, day)) === value;
}
export function selectedRange(period, year, month, now = new Date()) {
  if (period === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return { start: dateKey(start), end: dateKey(now) };
  }
  return period === "year"
    ? { start: `${year}-01-01`, end: `${year}-12-31` }
    : {
        start: dateKey(new Date(year, month, 1)),
        end: dateKey(new Date(year, month + 1, 0)),
      };
}
export function heatLevel(seconds, goalMinutes) {
  const ratio = Math.max(0, seconds) / (Math.max(1, goalMinutes) * 60);
  if (!ratio) return 0;
  if (ratio >= 1.5) return 4;
  if (ratio >= 1) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}
export function hoursLabel(seconds) {
  return `${Number((Math.max(0, seconds) / 3600).toFixed(1))} h`;
}
