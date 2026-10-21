import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from './sessionStore';

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const WARN_BEFORE_MS = 2 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'wheel', 'touchstart'];

/**
 * Signs the user out after 30 minutes of inactivity, with a 2-minute warning
 * (plan §11). The timer is driven by real user input, not by network traffic,
 * since background polling would otherwise keep a walked-away session alive.
 */
export function useIdleTimeout({ onExpire }) {
  const status = useSessionStore((s) => s.status);
  const active = status === 'authenticated' || status === 'pending_password_change';
  const [warning, setWarning] = useState(null);
  const lastActivity = useRef(Date.now());

  const resetTimer = useCallback(() => {
    lastActivity.current = Date.now();
    setWarning(null);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const onActivity = () => {
      // While the warning is showing, only an explicit "Stay signed in"
      // dismisses it — otherwise a stray mouse move would hide the countdown
      // and the user would be signed out with no warning at all.
      if (!warning) lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
  }, [active, warning]);

  useEffect(() => {
    if (!active) return undefined;
    const tick = setInterval(() => {
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= IDLE_LIMIT_MS) {
        clearInterval(tick);
        setWarning(null);
        onExpire();
      } else if (idleFor >= IDLE_LIMIT_MS - WARN_BEFORE_MS) {
        setWarning({ secondsLeft: Math.ceil((IDLE_LIMIT_MS - idleFor) / 1000) });
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [active, onExpire]);

  return { warning, staySignedIn: resetTimer };
}
