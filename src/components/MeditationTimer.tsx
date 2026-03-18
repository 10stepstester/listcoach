'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type TimerState = 'idle' | 'running' | 'complete';

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}

function playCompletionChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const notes = [800, 1000, 1200];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.5);
    });
  } catch {
    // Audio not available
  }
}

export default function MeditationTimer({ darkMode = false, accentColor = '#3b82f6' }: { darkMode?: boolean; accentColor?: string }) {
  const [state, setState] = useState<TimerState>('idle');
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [showPopover, setShowPopover] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastChimeRef = useRef(0);
  const autoResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const dm = darkMode;
  const trackColor = dm ? '#27272a' : '#e5e7eb';

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback((minutes: number) => {
    cleanup();
    const secs = minutes * 60;
    setTotalSeconds(secs);
    setRemaining(secs);
    setState('running');
    lastChimeRef.current = secs;
    playChime();

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next > 0 && next % 30 === 0 && next !== lastChimeRef.current) {
          lastChimeRef.current = next;
          playChime();
        }
        if (next <= 0) {
          cleanup();
          setState('complete');
          playCompletionChime();
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [cleanup]);

  const cancel = useCallback(() => {
    cleanup();
    setState('idle');
    setRemaining(0);
  }, [cleanup]);

  const reset = useCallback(() => {
    setState('idle');
    setRemaining(0);
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Auto-reset after completion (3 seconds)
  useEffect(() => {
    if (state === 'complete') {
      autoResetRef.current = setTimeout(() => reset(), 3000);
      return () => {
        if (autoResetRef.current) clearTimeout(autoResetRef.current);
      };
    }
  }, [state, reset]);

  // Click-outside handler for popover
  useEffect(() => {
    if (!showPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPopover]);

  const progress = totalSeconds > 0 ? (totalSeconds - remaining) / totalSeconds : 0;
  const circumference = 2 * Math.PI * 54;
  const strokeOffset = circumference - progress * circumference;

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <>
      {/* ===== DESKTOP: Original circle design (sm and up) ===== */}
      <div className="hidden sm:flex flex-col items-center gap-3">
        <p className="text-sm font-medium tracking-wide uppercase" style={{ color: accentColor }}>
          Get Centered
        </p>

        {state === 'idle' && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke={trackColor} strokeWidth="4" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-2xl ${dm ? 'text-gray-500' : 'text-gray-400'}`}>--:--</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => start(2)}
                className="px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium"
                style={{ backgroundColor: `${accentColor}20`, color: accentColor, border: `1px solid ${accentColor}40` }}
              >
                2 min
              </button>
              <button
                onClick={() => start(5)}
                className="px-4 py-2 rounded-lg transition-all duration-200 text-sm font-medium"
                style={{ backgroundColor: `${accentColor}20`, color: accentColor, border: `1px solid ${accentColor}40` }}
              >
                5 min
              </button>
            </div>
          </div>
        )}

        {state === 'running' && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke={trackColor} strokeWidth="4" />
                <circle
                  cx="60" cy="60" r="54"
                  fill="none"
                  strokeWidth="4"
                  className="transition-all duration-1000 ease-linear"
                  style={{ stroke: accentColor }}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-mono tabular-nums" style={{ color: accentColor }}>
                  {mm}:{ss}
                </span>
              </div>
            </div>
            <button
              onClick={cancel}
              className={`px-4 py-1.5 rounded-lg transition-all duration-200 text-sm ${dm ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
            >
              Cancel
            </button>
          </div>
        )}

        {state === 'complete' && (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" strokeWidth="4" style={{ stroke: accentColor }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-10 h-10 animate-bounce-gentle" style={{ color: accentColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <p className="text-sm font-medium" style={{ color: accentColor }}>Centered</p>
            <button
              onClick={reset}
              className={`px-4 py-1.5 rounded-lg transition-all duration-200 text-sm ${dm ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* ===== MOBILE: Compact pill design (below sm) ===== */}
      <div className="flex sm:hidden relative">
        {state === 'idle' && (
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setShowPopover(!showPopover)}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
              style={{ backgroundColor: `${accentColor}1F`, color: accentColor }}
            >
              Center
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showPopover ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showPopover && (
              <div
                className={`absolute top-full left-0 mt-1.5 flex gap-1.5 p-1.5 rounded-xl shadow-lg border z-50 ${dm ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}
              >
                <button
                  onClick={() => { start(2); setShowPopover(false); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                  style={{ backgroundColor: `${accentColor}1F`, color: accentColor, border: `1px solid ${accentColor}30` }}
                >
                  2 min
                </button>
                <button
                  onClick={() => { start(5); setShowPopover(false); }}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                  style={{ backgroundColor: `${accentColor}1F`, color: accentColor, border: `1px solid ${accentColor}30` }}
                >
                  5 min
                </button>
              </div>
            )}
          </div>
        )}

        {state === 'running' && (
          <div
            className="relative flex items-center gap-2.5 px-4 py-2 rounded-full overflow-hidden"
            style={{ backgroundColor: `${accentColor}1F` }}
          >
            {/* Pulsing dot indicator */}
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: accentColor }} />
            {/* Countdown */}
            <span className="text-sm font-mono tabular-nums font-medium" style={{ color: accentColor }}>
              {mm}:{ss}
            </span>
            {/* Cancel button */}
            <button
              onClick={cancel}
              className="ml-0.5 flex items-center justify-center w-5 h-5 rounded-full transition-colors duration-150"
              style={{ color: accentColor }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {/* Progress bar along bottom */}
            <div
              className="absolute bottom-0 left-0 h-[2px] transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${progress * 100}%`, backgroundColor: accentColor }}
            />
          </div>
        )}

        {state === 'complete' && (
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium animate-fade-in transition-all duration-200"
            style={{ backgroundColor: `${accentColor}1F`, color: accentColor }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Centered
          </button>
        )}
      </div>
    </>
  );
}
