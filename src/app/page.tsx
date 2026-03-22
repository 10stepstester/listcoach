'use client';

import { useState, useCallback, useEffect } from 'react';
import MeditationTimer from '@/components/MeditationTimer';
import GoalList from '@/components/GoalList';
import Settings from '@/components/Settings';
import ActionButtons from '@/components/ActionButtons';

export default function Home() {
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [darkMode, setDarkMode] = useState(true); // default dark until localStorage loads
  const [goalId, setGoalId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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

      {/* ── Mobile layout (below md) ────────────────────────────────── */}
      <div className="md:hidden">
        {/* Mobile top bar: single row — timer circle + action buttons + gear */}
        <div className="px-3 pt-2 pb-1">
          <ActionButtons
            goalId={goalId}
            darkMode={darkMode}
            accentColor={accentColor}
            onThoughtAdded={() => setRefreshKey((k) => k + 1)}
            showSettingsGear={true}
            timerSlot={<MeditationTimer darkMode={darkMode} accentColor={accentColor} inline={true} />}
          />
        </div>

        {/* Mobile list */}
        <main className="px-4 pt-1" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}>
          <GoalList
            accentColor={accentColor}
            darkMode={darkMode}
            refreshKey={refreshKey}
            onGoalLoaded={setGoalId}
          />
        </main>
      </div>

      {/* ── Desktop layout (md and up) ──────────────────────────────── */}
      <div className="hidden md:flex items-start gap-8 px-6 lg:px-10 pt-6">
        {/* Left column: Timer */}
        <div className="flex-shrink-0 w-[180px]">
          <MeditationTimer darkMode={darkMode} accentColor={accentColor} />
        </div>

        {/* Main content column */}
        <div className="flex-1 max-w-[640px]">
          <ActionButtons
            goalId={goalId}
            darkMode={darkMode}
            accentColor={accentColor}
            onThoughtAdded={() => setRefreshKey((k) => k + 1)}
          />
          <GoalList
            accentColor={accentColor}
            darkMode={darkMode}
            refreshKey={refreshKey}
            onGoalLoaded={setGoalId}
          />
          <div style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }} />
        </div>

        {/* Settings gear (top right) */}
        <div className="flex-shrink-0">
          <Settings onAccentChange={handleAccentChange} onDarkModeChange={handleDarkModeChange} darkMode={darkMode} />
        </div>
      </div>
    </div>
  );
}
