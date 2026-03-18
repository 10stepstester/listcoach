'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { User } from '@/types/index';

interface SettingsProps {
  onAccentChange?: (color: string) => void;
  onDarkModeChange?: (dark: boolean) => void;
  darkMode?: boolean;
}

export default function Settings({ onAccentChange, onDarkModeChange }: SettingsProps) {
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [loaded, setLoaded] = useState(false);

  const loadSettings = useCallback(async () => {
    // First check localStorage for instant theme
    const savedDark = localStorage.getItem('darkMode');
    const savedAccent = localStorage.getItem('accentColor');
    if (savedDark !== null) {
      onDarkModeChange?.(savedDark === 'true');
    }
    if (savedAccent) {
      setAccentColor(savedAccent);
      onAccentChange?.(savedAccent);
    }

    // Then fetch from server to sync
    try {
      const res = await fetch('/api/user/settings');
      if (res.ok) {
        const json = await res.json();
        const data: Partial<User> = json.user || json;
        if (data.accent_color) {
          setAccentColor(data.accent_color);
          onAccentChange?.(data.accent_color);
          localStorage.setItem('accentColor', data.accent_color);
        }
        if (data.dark_mode !== undefined) {
          onDarkModeChange?.(data.dark_mode);
          localStorage.setItem('darkMode', String(data.dark_mode));
        }
      }
    } catch {
      // Failed to load
    } finally {
      setLoaded(true);
    }
  }, [onAccentChange, onDarkModeChange]);

  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  return (
    <Link
      href="/settings"
      className="p-2 rounded-lg transition-all duration-200"
      style={{ color: accentColor }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${accentColor}15`; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
      title="Settings"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </Link>
  );
}
