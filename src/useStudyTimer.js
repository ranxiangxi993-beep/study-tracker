import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Alert, Platform, DeviceEventEmitter } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { startSession, stopSession, getActiveSession } from "./storage";
import {
  ensureNotifPermission,
  scheduleTimerEnd,
  cancelScheduled,
  startLiveTimer,
  stopLiveTimer,
  setLiveTimerPromoted,
  isScreenInteractive,
  openNotificationSettings,
  getTimerCapabilities,
  openExactAlarmSettings,
} from "./notify";
import {
  isLockActive,
  lockScreen,
  unlockScreen,
  setStudyDeadline,
  openAccessibilitySettings,
} from "./nativeLock";
import {
  TIMER_STATE_KEY,
  TIMER_INTERRUPT_EVENT,
  elapsedSeconds,
  remainingSeconds,
  parseTimer,
  pauseTimer,
  resumeTimer,
} from "./timerState";

export default function useStudyTimer(onComplete) {
  const [timer, setTimer] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const ref = useRef(null);
  const transition = useRef(false);
  const complete = useRef(onComplete);
  complete.current = onComplete;

  const persist = useCallback(async (value) => {
    if (value)
      await AsyncStorage.setItem(TIMER_STATE_KEY, JSON.stringify(value));
    else await AsyncStorage.removeItem(TIMER_STATE_KEY);
    ref.current = value;
    setTimer(value);
    setNow(Date.now());
  }, []);

  const end = useCallback(
    async (natural = false, endedAt = Date.now()) => {
      const current = ref.current;
      if (!current || transition.current) return;
      transition.current = true;
      setBusy(true);
      try {
        if (!natural) await cancelScheduled(current.notificationId);
        await stopLiveTimer();
        if (current.boundLock) await unlockScreen();
        if (current.sessionId)
          await stopSession(
            current.sessionId,
            elapsedSeconds(current, endedAt),
          );
        await persist(null);
        complete.current?.(current, natural);
        return true;
      } catch (error) {
        Alert.alert("未能保存学习记录", "记录仍保留在本机，请再次结束计时。");
        return false;
      } finally {
        transition.current = false;
        setBusy(false);
      }
    },
    [persist],
  );

  const reconcileInterrupt = useCallback(async () => {
    const requested = await AsyncStorage.getItem("timer_interrupt_requested");
    if (!requested || !ref.current) return false;
    const endedAt = Number(requested) > 1 ? Number(requested) : Date.now();
    if (await end(false, endedAt))
      await AsyncStorage.removeItem("timer_interrupt_requested");
    return true;
  }, [end]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      TIMER_INTERRUPT_EVENT,
      reconcileInterrupt,
    );
    return () => subscription.remove();
  }, [reconcileInterrupt]);

  useFocusEffect(
    useCallback(() => {
      reconcileInterrupt();
    }, [reconcileInterrupt]),
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = parseTimer(await AsyncStorage.getItem(TIMER_STATE_KEY));
        if (!alive) return;
        if (saved) {
          ref.current = saved;
          setTimer(saved);
          if (await reconcileInterrupt()) return;
          if (!saved.countUp && !saved.paused) {
            const remaining = remainingSeconds(saved);
            if (remaining <= 0) await end(true);
            else if (Platform.OS === "android") {
              const capabilities = await getTimerCapabilities();
              if (!capabilities.liveRunning) {
                saved.notificationId = await scheduleTimerEnd(
                  remaining,
                  saved.mode === "work",
                  saved.subjectName,
                  saved.strongAlert,
                );
                await startLiveTimer(
                  remaining,
                  saved.mode === "work" ? saved.subjectName : "休息中",
                );
                await persist({ ...saved });
              }
            }
          }
        } else {
          // Older versions have no pause checkpoint. Keep the orphan for explicit recovery.
          const orphan = await getActiveSession();
          if (orphan)
            Alert.alert(
              "发现未完成的学习记录",
              "上次计时中断，无法准确判断暂停时间。可以保留已记录时长并结束该记录。",
              [
                {
                  text: "结束记录",
                  onPress: async () => {
                    await stopSession(orphan.id, orphan.duration || 0);
                    complete.current?.();
                  },
                },
              ],
            );
        }
      } catch {
        Alert.alert(
          "读取计时失败",
          "请重新打开应用，已保存的学习记录不会被删除。",
        );
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [end, persist, reconcileInterrupt]);

  useEffect(() => {
    if (!timer || timer.paused) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (
        ref.current &&
        !ref.current.countUp &&
        !ref.current.paused &&
        remainingSeconds(ref.current) <= 0
      )
        end(true);
    }, 1000);
    return () => clearInterval(id);
  }, [timer, end]);

  useEffect(() => {
    let seq = 0;
    let deferred;
    const subscription = AppState.addEventListener("change", async (state) => {
      const currentSeq = ++seq;
      clearTimeout(deferred);
      if (state === "active") {
        setNow(Date.now());
        if (await reconcileInterrupt()) return;
        if (
          ref.current &&
          !ref.current.paused &&
          !ref.current.countUp &&
          remainingSeconds(ref.current) <= 0
        )
          end(true);
      } else if (state === "background") {
        deferred = setTimeout(async () => {
          if (seq !== currentSeq || !ref.current || ref.current.paused) return;
          const interactive = await isScreenInteractive();
          if (
            seq === currentSeq &&
            ref.current &&
            !ref.current.paused &&
            interactive
          )
            await setLiveTimerPromoted(false);
        }, 900);
      }
    });
    return () => {
      ++seq;
      clearTimeout(deferred);
      subscription.remove();
    };
  }, [end, reconcileInterrupt]);

  const start = async (options) => {
    if (!ready || transition.current || (ref.current && !ref.current.paused))
      return;
    transition.current = true;
    setBusy(true);
    let next;
    let acquiredLock = false;
    try {
      if (Platform.OS !== "web" && !(await ensureNotifPermission())) {
        Alert.alert("需要通知权限", "允许通知后，学习结束时才能收到提醒。", [
          { text: "取消", style: "cancel" },
          { text: "设置", onPress: openNotificationSettings },
        ]);
        return;
      }
      const previous = ref.current;
      next = previous
        ? resumeTimer(previous)
        : {
            ...options,
            duration: options.minutes * 60,
            startedAt: Date.now(),
            elapsed: 0,
            paused: false,
            notificationId: null,
            sessionId: null,
            boundLock: false,
          };
      if (!next.countUp && Platform.OS === "android") {
        const permissions = await getTimerCapabilities();
        if (
          permissions.native &&
          (!permissions.exactAlarm || !permissions.completionAlert)
        ) {
          const alarmMissing = !permissions.exactAlarm;
          Alert.alert(
            alarmMissing ? "需要精确闹钟权限" : "结束提醒已被静音",
            "开启后，锁屏和息屏时的学习结束提醒才能正常工作。",
            [
              { text: "取消", style: "cancel" },
              {
                text: "去设置",
                onPress: alarmMissing
                  ? openExactAlarmSettings
                  : openNotificationSettings,
              },
            ],
          );
          return;
        }
      }
      if (next.bindStudy && next.level === "strong" && next.mode === "work") {
        if (await isLockActive()) next.boundLock = true;
        else {
          const result = await lockScreen("strong");
          if (result !== "accessibility") {
            Alert.alert(
              "专注锁尚未生效",
              "请先开启无障碍服务，或在专注锁页面关闭学习段绑定。",
              [
                { text: "取消", style: "cancel" },
                { text: "开启服务", onPress: openAccessibilitySettings },
              ],
            );
            return;
          }
          next.boundLock = true;
          acquiredLock = true;
        }
      }
      if (!next.sessionId && next.mode === "work")
        next.sessionId = await startSession(next.subject);
      next.startedAt = Date.now();
      // Save first so process death cannot erase the active session or its pause state.
      await persist(next);
      if (!next.countUp) {
        const remaining = remainingSeconds(next);
        next.notificationId = await scheduleTimerEnd(
          remaining,
          next.mode === "work",
          next.subjectName,
          next.strongAlert,
        );
        if (!next.notificationId && Platform.OS !== "web")
          throw new Error("alarm");
        if (next.boundLock)
          await setStudyDeadline(next.startedAt + remaining * 1000);
        await startLiveTimer(
          remaining,
          next.mode === "work" ? next.subjectName : "休息中",
        );
      }
      await persist({ ...next });
    } catch {
      if (next?.notificationId) await cancelScheduled(next.notificationId);
      await stopLiveTimer();
      if (acquiredLock || next?.boundLock) await unlockScreen();
      if (next) await persist(pauseTimer(next));
      Alert.alert(
        "计时已暂停",
        "结束提醒未能成功设置。请检查通知和闹钟权限后重试。",
      );
    } finally {
      transition.current = false;
      setBusy(false);
    }
  };

  const pause = async () => {
    if (!ref.current || transition.current || ref.current.paused) return;
    transition.current = true;
    setBusy(true);
    try {
      const previous = ref.current;
      await persist(pauseTimer(previous));
      await cancelScheduled(previous.notificationId);
      await stopLiveTimer();
      if (previous.boundLock) await unlockScreen();
    } catch {
      Alert.alert("暂停未完成", "请重试暂停，或使用专注锁页面的应急解锁。");
    } finally {
      transition.current = false;
      setBusy(false);
    }
  };

  return {
    timer,
    ready,
    busy,
    now,
    start,
    pause,
    end,
    elapsed: timer ? elapsedSeconds(timer, now) : 0,
  };
}
