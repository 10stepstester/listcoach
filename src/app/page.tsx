'use client';

import { useState, useCallback, useEffect } from 'react';
import MeditationTimer from '@/components/MeditationTimer';
import GoalList from '@/components/GoalList';
import Settings from '@/components/Settings';

export default function Home() {
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [darkMode, setDarkMode] = useState(true); // default dark until localStorage loads

  // Read from localStorage on mount for instant theme
  useEffect(() => {
    const savedDark = localStorage.getItem('darkMode');
    const savedAccent = localStorage.getItem('accentColor');
    if (savedDark !== null) setDarkMode(savedDark === 'true');
    if (savedAccent) {
      setAccentColor(savedAccent);
      document.documentElement.style.setProperty('--accent', savedAccent);
      document.documentElement.style.setProperty('--accent-20', `${savedAccent}33`);
      document.documentElement.style.setProperty('--accent-50', `${savedAccent}80`);
    }
  }, []);

  const handleAccentChange = useCallback((color: string) => {
    setAccentColor(color);
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-20', `${color}33`);
    document.documentElement.style.setProperty('--accent-50', `${color}80`);
    localStorage.setItem('accentColor', color);
  }, []);

  const handleDarkModeChange = useCallback((dark: boolean) => {
    setDarkMode(dark);
    localStorage.setItem('darkMode', String(dark));
  }, []);

  return (
    <div className={`min-h-dvh transition-colors duration-300 ${darkMode ? 'bg-[#0c0c0f] text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Safe area top spacer — pushes content below iPhone notch */}
      <div className="w-full" style={{ height: 'env(safe-area-inset-top, 0px)' }} />

      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 pt-2 pb-1 sm:px-6 sm:py-6 md:px-10 md:py-8">
        <div className="flex-shrink-0">
          <MeditationTimer darkMode={darkMode} accentColor={accentColor} />
        </div>
        <div className="flex-shrink-0">
          <Settings onAccentChange={handleAccentChange} onDarkModeChange={handleDarkModeChange} darkMode={darkMode} />
        </div>
      </header>

      {/* Main Content: Goal List */}
      <main className="px-4 pt-1 sm:pt-0 sm:px-6 md:px-10" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="mx-auto max-w-2xl">
          <GoalList accentColor={accentColor} darkMode={darkMode} />
        </div>
      </main>
    </div>
  );
}
