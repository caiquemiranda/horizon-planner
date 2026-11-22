import { useEffect, useState } from 'react';

import type { DayNumber } from '@/types/timeline';

import { getTodayDay } from '../lib/time';

/** Current moment as a fractional day number, refreshed periodically (default: every minute). */
export function useTodayDay(refreshMs = 60_000): DayNumber {
  const [today, setToday] = useState(() => getTodayDay());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday(getTodayDay());
    }, refreshMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshMs]);

  return today;
}
