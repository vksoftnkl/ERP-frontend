import { useEffect, useRef, useState } from "react";
export function useThrottle<T>(value: T, delay = 300): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastExecutedAtRef = useRef(0);
  const trailingValueRef = useRef(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const safeDelay = Math.max(0, delay);
    if (safeDelay === 0) {
      setThrottledValue(value);
      lastExecutedAtRef.current = Date.now();
      return;
    }
    const now = Date.now();
    const remainingTime = safeDelay - (now - lastExecutedAtRef.current);
    trailingValueRef.current = value;
    if (remainingTime <= 0 || remainingTime > safeDelay) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setThrottledValue(value);
      lastExecutedAtRef.current = now;
      return;
    }
    if (!timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        setThrottledValue(trailingValueRef.current);
        lastExecutedAtRef.current = Date.now();
        timeoutRef.current = null;
      }, remainingTime);
    }
  }, [value, delay]);
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);
  return throttledValue;
}
