import { useState, useEffect, useCallback, useRef } from "react";

interface CountdownState {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isExpired: boolean;
  formatted: string;
  percentRemaining: number;
}

export function useCountdown(
  endTime: Date | string | null | undefined,
  totalDurationMinutes?: number
): CountdownState {
  const calculateTimeLeft = useCallback((): CountdownState => {
    if (!endTime) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        isExpired: true,
        formatted: "--:--",
        percentRemaining: 0,
      };
    }

    const end = typeof endTime === "string" ? new Date(endTime) : endTime;
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSeconds: 0,
        isExpired: true,
        formatted: "00:00",
        percentRemaining: 0,
      };
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    let formatted: string;
    if (days > 0) {
      formatted = `${days}d ${hours}h`;
    } else if (hours > 0) {
      formatted = `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    } else {
      formatted = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    }

    const totalDurationSeconds = (totalDurationMinutes || 60) * 60;
    const percentRemaining = Math.min(100, (totalSeconds / totalDurationSeconds) * 100);

    return {
      days,
      hours,
      minutes,
      seconds,
      totalSeconds,
      isExpired: false,
      formatted,
      percentRemaining,
    };
  }, [endTime, totalDurationMinutes]);

  const [timeLeft, setTimeLeft] = useState<CountdownState>(calculateTimeLeft);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    setTimeLeft(calculateTimeLeft());

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = window.setInterval(() => {
      const newState = calculateTimeLeft();
      setTimeLeft(newState);
      
      if (newState.isExpired && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [calculateTimeLeft]);

  return timeLeft;
}
