'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { User } from '@/types/index';
import PromptEditor from '@/components/PromptEditor';

type NudgeStyle = User['nudge_style'];

const NUDGE_OPTIONS: { value: NudgeStyle; label: string; description: string }[] = [
  {
    value: 'direct',
    label: 'Direct',
    description: 'Relentless. Nudges every 10 min when your calendar is free. Won\'t stop until you engage.',
  },
  {
    value: 'average',
    label: 'Average',
    description: 'Persistent but balanced. Follows up every 20-30 min. Eases off after several unanswered.',
  },
  {
    value: 'gentle',
    label: 'Gentle',
    description: 'Patient. Sends one nudge, then waits for you to respond.',
  },
];

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const ampm = i < 12 ? 'AM' : 'PM';
  return { value: `${String(i).padStart(2, '0')}:00`, label: `${h}:00 ${ampm}` };
});

const COLOR_PRESETS = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#d946ef', label: 'Fuchsia' },
  { value: '#f43f5e', label: 'Rose' },
];

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  // Settings state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nudgeStyle, setNudgeStyle] = useState<NudgeStyle>('average');
  const [activeHoursStart, setActiveHoursStart] = useState('09:00');
  const [activeHoursEnd, setActiveHoursEnd] = useState('21:00');
  const [outcomeTarget, setOutcomeTarget] = useState('');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [darkMode, setDarkMode] = useState(true);
  const [hasGoogleCalendar, setHasGoogleCalendar] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string | null>(null);

  // Apply theme from localStorage immediately
  useEffect(() => {
    const savedDark = localStorage.getItem('darkMode');
    const savedAccent = localStorage.getItem('accentColor');
    if (savedDark !== null) setDarkMode(savedDark === 'true');
    if (savedAccent) setAccentColor(savedAccent);
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--accent-20', `${accentColor}33`);
    document.documentElement.style.setProperty('--accent-50', `${accentColor}80`);
  }, [accentColor]);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/user/settings');
      if (res.ok) {
        const json = await res.json();
        const data: Partial<User> = json.user || json;
        if (data.phone_number) setPhoneNumber(data.phone_number);
        if (data.nudge_style) setNudgeStyle(data.nudge_style);
        if (data.active_hours_start) setActiveHoursStart(data.active_hours_start);
        if (data.active_hours_end) setActiveHoursEnd(data.active_hours_end);
        if (data.outcome_target) setOutcomeTarget(data.outcome_target);
        if (data.accent_color) setAccentColor(data.accent_color);
        if (data.dark_mode !== undefined) setDarkMode(data.dark_mode);
        setHasGoogleCalendar(!!data.google_calendar_token);
        if (data.custom_prompt !== undefined) setCustomPrompt(data.custom_prompt);
      }
    } catch {
      // Failed to load
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) loadSettings();
  }, [loaded, loadSettings]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneNumber,
          nudge_style: nudgeStyle,
          active_hours_start: activeHoursStart,
          active_hours_end: activeHoursEnd,
          outcome_target: outcomeTarget,
          accent_color: accentColor,
          dark_mode: darkMode,
        }),
      });
      if (res.ok) {
        // Persist theme to localStorage
        localStorage.setItem('darkMode', String(darkMode));
        localStorage.setItem('accentColor', accentColor);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      }
    } catch {
      // Save failed
    } finally {
      setSaving(false);
    }
  };

  const handleColorSelect = (color: string) => {
    setAccentColor(color);
    localStorage.setItem('accentColor', color);
  };

  const handleDarkModeToggle = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('darkMode', String(next));
  };

  // Dynamic classes
  const dm = darkMode;
  const pageBg = dm ? 'bg-[#0c0c0f]' : 'bg-gray-50';
  const cardBg = dm ? 'bg-zinc-900/80' : 'bg-white';
  const cardBorder = dm ? 'border-zinc-800' : 'border-gray-200';
  const headingColor = dm ? 'text-white' : 'text-gray-900';
  const labelColor = dm ? 'text-gray-300' : 'text-gray-700';
  const inputBg = dm ? 'bg-zinc-800 border-zinc-700 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400';
  const subText = dm ? 'text-gray-500' : 'text-gray-400';
  const backLinkColor = dm ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900';

  if (!loaded) {
    return (
      <div className={`min-h-screen ${pageBg} flex items-center justify-center`}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${pageBg} transition-colors duration-300`}>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/"
            className={`p-2 -ml-2 rounded-lg transition-colors ${backLinkColor}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className={`text-xl font-semibold ${headingColor}`}>Settings</h1>
          {showSaved && (
            <span className="ml-auto text-sm text-emerald-500 font-medium animate-fade-in">Saved!</span>
          )}
        </div>

        <div className="space-y-6">

          {/* === CARD: Appearance === */}
          <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5 sm:p-6 space-y-5`}>
            <h2 className={`text-sm font-semibold ${headingColor} uppercase tracking-wider`}>Appearance</h2>

            {/* Dark Mode Toggle */}
            <div className="flex items-center justify-between">
              <label className={`text-sm font-medium ${labelColor}`}>Dark Mode</label>
              <button
                onClick={handleDarkModeToggle}
                className={`
                  relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200
                  ${!darkMode ? 'bg-gray-300' : ''}
                `}
                style={darkMode ? { backgroundColor: accentColor } : undefined}
              >
                <span
                  className={`
                    inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200
                    ${darkMode ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>

            {/* Accent Color */}
            <div>
              <label className={`block text-sm font-medium ${labelColor} mb-3`}>Accent Color</label>
              <div className="grid grid-cols-6 gap-3">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => handleColorSelect(c.value)}
                    className="relative flex items-center justify-center"
                    title={c.label}
                  >
                    <div
                      className={`
                        w-10 h-10 sm:w-9 sm:h-9 rounded-full transition-all duration-200 flex items-center justify-center
                        ${accentColor === c.value ? 'scale-110' : 'hover:scale-110'}
                      `}
                      style={{
                        backgroundColor: c.value,
                        boxShadow: accentColor === c.value
                          ? `0 0 0 2px ${dm ? '#18181b' : '#ffffff'}, 0 0 0 4px ${c.value}, 0 0 12px ${c.value}40`
                          : undefined,
                      }}
                    >
                      {accentColor === c.value && (
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label className={`text-xs ${subText}`}>Custom:</label>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => handleColorSelect(e.target.value)}
                  className={`w-10 h-10 sm:w-8 sm:h-8 rounded-lg cursor-pointer border-2 ${dm ? 'border-zinc-700' : 'border-gray-300'} bg-transparent p-0.5`}
                />
                <span className={`text-xs ${subText} font-mono`}>{accentColor}</span>
              </div>
            </div>
          </div>

          {/* === CARD: SMS Coaching === */}
          <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5 sm:p-6 space-y-5`}>
            <h2 className={`text-sm font-semibold ${headingColor} uppercase tracking-wider`}>SMS Coaching</h2>

            {/* Phone Number */}
            <div>
              <label className={`block text-sm font-medium ${labelColor} mb-2`}>Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className={`w-full px-3 py-3 sm:py-2.5 ${inputBg} border rounded-lg outline-none transition-colors text-base sm:text-sm`}
                onFocus={(e) => { e.currentTarget.style.borderColor = accentColor; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = ''; }}
              />
            </div>

            {/* Nudge Style */}
            <div>
              <label className={`block text-sm font-medium ${labelColor} mb-2`}>Nudge Style</label>
              <div className="space-y-2">
                {NUDGE_OPTIONS.map((opt) => {
                  const isSelected = nudgeStyle === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setNudgeStyle(opt.value)}
                      className={`
                        w-full px-4 py-3 rounded-lg text-left
                        border transition-all duration-200
                      `}
                      style={isSelected ? {
                        backgroundColor: `${accentColor}15`,
                        borderColor: `${accentColor}60`,
                      } : {
                        backgroundColor: dm ? 'rgb(39 39 42 / 0.5)' : 'rgb(249 250 251)',
                        borderColor: dm ? 'rgb(63 63 70)' : 'rgb(209 213 219)',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                          style={{
                            borderColor: isSelected ? accentColor : (dm ? 'rgb(113 113 122)' : 'rgb(156 163 175)'),
                          }}
                        >
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
                          )}
                        </div>
                        <span
                          className="text-sm font-medium"
                          style={{ color: isSelected ? accentColor : (dm ? 'rgb(212 212 216)' : 'rgb(55 65 81)') }}
                        >
                          {opt.label}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ml-6 ${isSelected ? '' : subText}`} style={isSelected ? { color: `${accentColor}cc` } : undefined}>
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Hours */}
            <div>
              <label className={`block text-sm font-medium ${labelColor} mb-2`}>Active Hours</label>
              <div className="flex items-center gap-3">
                <select
                  value={activeHoursStart}
                  onChange={(e) => setActiveHoursStart(e.target.value)}
                  className={`flex-1 px-3 py-3 sm:py-2.5 ${inputBg} border rounded-lg outline-none transition-colors text-base sm:text-sm`}
                  onFocus={(e) => { e.currentTarget.style.borderColor = accentColor; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = ''; }}
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
                <span className={`${subText} text-sm`}>to</span>
                <select
                  value={activeHoursEnd}
                  onChange={(e) => setActiveHoursEnd(e.target.value)}
                  className={`flex-1 px-3 py-3 sm:py-2.5 ${inputBg} border rounded-lg outline-none transition-colors text-base sm:text-sm`}
                  onFocus={(e) => { e.currentTarget.style.borderColor = accentColor; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = ''; }}
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>
              <p className={`text-xs ${subText} mt-1.5`}>
                Nudges are only sent during these hours in your timezone.
              </p>
            </div>

            {/* Outcome Target */}
            <div>
              <label className={`block text-sm font-medium ${labelColor} mb-2`}>Outcome Target</label>
              <input
                type="text"
                value={outcomeTarget}
                onChange={(e) => setOutcomeTarget(e.target.value)}
                placeholder="What are you working towards?"
                className={`w-full px-3 py-3 sm:py-2.5 ${inputBg} border rounded-lg outline-none transition-colors text-base sm:text-sm`}
                onFocus={(e) => { e.currentTarget.style.borderColor = accentColor; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = ''; }}
              />
              <p className={`text-xs ${subText} mt-1.5`}>
                Your big-picture goal. The AI references this to connect daily tasks to the bigger picture.
              </p>
            </div>
          </div>

          {/* === CARD: AI Prompt === */}
          <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5 sm:p-6`}>
            <h2 className={`text-sm font-semibold ${headingColor} uppercase tracking-wider mb-4`}>AI Prompt</h2>
            <PromptEditor
              darkMode={dm}
              accentColor={accentColor}
              initialPrompt={customPrompt}
              onSave={(p) => {
                setCustomPrompt(p);
              }}
            />
          </div>

          {/* === CARD: Integrations === */}
          <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5 sm:p-6 space-y-4`}>
            <h2 className={`text-sm font-semibold ${headingColor} uppercase tracking-wider`}>Integrations</h2>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dm ? 'bg-zinc-800' : 'bg-gray-100'}`}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill={dm ? '#d1d5db' : '#4b5563'}>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </div>
                <div>
                  <p className={`text-sm font-medium ${headingColor}`}>Google Calendar</p>
                  <p className={`text-xs ${subText}`}>
                    {hasGoogleCalendar ? 'Skips nudges when you\'re in meetings' : 'Connect to skip nudges during meetings'}
                  </p>
                </div>
              </div>
              {hasGoogleCalendar ? (
                <div className="flex items-center gap-1.5 text-sm text-emerald-500 font-medium">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Connected
                </div>
              ) : (
                <a
                  href="/api/auth/google"
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  Connect
                </a>
              )}
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 sm:py-2.5 text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: accentColor }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>

          <div className="h-8" /> {/* Bottom spacing for mobile */}
        </div>
      </div>
    </div>
  );
}
