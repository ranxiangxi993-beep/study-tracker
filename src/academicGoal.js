import AsyncStorage from "@react-native-async-storage/async-storage";

export const ACADEMIC_GOAL_KEY = "academic_goal";
export const GOAL_LIMITS = { university: 60, major: 80 };
export const EMPTY_ACADEMIC_GOAL = { university: "", major: "" };

const clean = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export function normalizeAcademicGoal(value) {
  return { university: clean(value?.university), major: clean(value?.major) };
}

export function academicGoalError(value) {
  const goal = normalizeAcademicGoal(value);
  if (!goal.university) return "请填写目标院校";
  if (goal.university.length > GOAL_LIMITS.university)
    return `院校名称不能超过 ${GOAL_LIMITS.university} 个字符`;
  if (goal.major.length > GOAL_LIMITS.major)
    return `专业名称不能超过 ${GOAL_LIMITS.major} 个字符`;
  return "";
}

export async function loadAcademicGoal() {
  const raw = await AsyncStorage.getItem(ACADEMIC_GOAL_KEY);
  try {
    const goal = normalizeAcademicGoal(JSON.parse(raw));
    return academicGoalError(goal) ? { ...EMPTY_ACADEMIC_GOAL } : goal;
  } catch {
    return { ...EMPTY_ACADEMIC_GOAL };
  }
}

export async function saveAcademicGoal(value) {
  const goal = normalizeAcademicGoal(value);
  const error = academicGoalError(goal);
  if (error) throw new Error(error);
  await AsyncStorage.setItem(ACADEMIC_GOAL_KEY, JSON.stringify(goal));
  return goal;
}

export async function clearAcademicGoal() {
  await AsyncStorage.removeItem(ACADEMIC_GOAL_KEY);
  return { ...EMPTY_ACADEMIC_GOAL };
}
