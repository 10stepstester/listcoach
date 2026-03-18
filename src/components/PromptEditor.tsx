'use client';

import { useState, useRef, useCallback } from 'react';
import { DEFAULT_COACHING_PROMPT } from '@/lib/prompts';

const PLACEHOLDERS = [
  { key: '{{nudge_style}}', label: 'Nudge Style', description: 'direct / average / gentle' },
  { key: '{{time_of_day}}', label: 'Time of Day', description: 'morning / afternoon / evening' },
  { key: '{{current_time}}', label: 'Current Time', description: 'Current time with timezone' },
  { key: '{{hours_since_activity}}', label: 'Hours Inactive', description: 'Hours since last activity' },
  { key: '{{outcome_target}}', label: 'Outcome Target', description: 'User\'s big-picture goal' },
  { key: '{{goals_summary}}', label: 'Goals Summary', description: 'Goals with subtask progress' },
  { key: '{{next_task}}', label: 'Next Task', description: 'Next uncompleted subtask' },
  { key: '{{recent_conversation}}', label: 'Recent Convo', description: 'Recent SMS history with timestamps' },
];

interface PromptEditorProps {
  darkMode?: boolean;
  accentColor?: string;
  initialPrompt?: string | null;
  onSave?: (prompt: string | null) => void;
}

export default function PromptEditor({
  darkMode = false,
  accentColor = '#3b82f6',
  initialPrompt,
  onSave,
}: PromptEditorProps) {
  const dm = darkMode;

  const [prompt, setPrompt] = useState(initialPrompt ?? DEFAULT_COACHING_PROMPT);
  const [savedPrompt, setSavedPrompt] = useState(initialPrompt ?? DEFAULT_COACHING_PROMPT);
  const [refining, setRefining] = useState(false);
  const [refinedSuggestion, setRefinedSuggestion] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasChanges = prompt !== savedPrompt;
  const isDefault = prompt === DEFAULT_COACHING_PROMPT;

  const insertPlaceholder = useCallback((placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = prompt.slice(0, start);
    const after = prompt.slice(end);
    setPrompt(before + placeholder + after);

    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + placeholder.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [prompt]);

  const handleRefine = async () => {
    setRefining(true);
    setRefinedSuggestion(null);
    try {
      const res = await fetch('/api/user/refine-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (res.ok) {
        const data = await res.json();
        setRefinedSuggestion(data.refined);
      }
    } catch {
      // Failed
    } finally {
      setRefining(false);
    }
  };

  const acceptRefinement = () => {
    if (refinedSuggestion) {
      setPrompt(refinedSuggestion);
      setRefinedSuggestion(null);
    }
  };

  const dismissRefinement = () => {
    setRefinedSuggestion(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save null when matching default (so built-in code is used)
      const promptToSave = prompt === DEFAULT_COACHING_PROMPT ? null : prompt;

      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_prompt: promptToSave,
        }),
      });
      if (res.ok) {
        setSavedPrompt(prompt);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
        onSave?.(promptToSave);
      }
    } catch {
      // Failed
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setPrompt(DEFAULT_COACHING_PROMPT);
    setRefinedSuggestion(null);
    // Auto-save the reset
    setSaving(true);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_prompt: null,
        }),
      });
      if (res.ok) {
        setSavedPrompt(DEFAULT_COACHING_PROMPT);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
        onSave?.(null);
      }
    } catch {
      // Failed
    } finally {
      setSaving(false);
    }
  };

  const inputBg = dm ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-50 border-gray-200';
  const labelColor = dm ? 'text-gray-300' : 'text-gray-700';
  const subText = dm ? 'text-gray-500' : 'text-gray-400';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className={`text-sm font-medium ${labelColor}`}>AI Coaching Prompt</label>
        <div className="flex items-center gap-2">
          {!isDefault && (
            <span className={`text-xs ${subText}`}>modified</span>
          )}
          {showSaved && (
            <span className="text-xs text-emerald-500 font-medium animate-fade-in">Saved!</span>
          )}
        </div>
      </div>

      <p className={`text-xs ${subText}`}>
        This is the full prompt sent to the AI every 10 minutes. It includes personality, rules, context data, and decision logic — all in one place.
      </p>

      {/* Placeholder chips */}
      <div className="flex flex-wrap gap-1.5">
        {PLACEHOLDERS.map((p) => (
          <button
            key={p.key}
            onClick={() => insertPlaceholder(p.key)}
            className="px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150"
            style={{
              backgroundColor: `${accentColor}15`,
              color: accentColor,
              border: `1px solid ${accentColor}30`,
            }}
            title={p.description}
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={20}
        className={`w-full px-3 py-2.5 ${inputBg} border rounded-lg outline-none text-sm font-mono leading-relaxed resize-y transition-colors ${dm ? 'text-gray-200' : 'text-gray-800'}`}
        style={{
          minHeight: '400px',
          borderColor: accentColor,
        }}
      />

      {/* Refined suggestion */}
      {refinedSuggestion && (
        <div className={`rounded-lg border p-3 space-y-3 ${dm ? 'bg-zinc-800/50 border-zinc-700' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${dm ? 'text-blue-400' : 'text-blue-600'}`}>
              AI Suggestion
            </span>
          </div>
          <pre className={`text-xs whitespace-pre-wrap font-mono leading-relaxed ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
            {refinedSuggestion}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={acceptRefinement}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
              style={{ backgroundColor: accentColor }}
            >
              Accept
            </button>
            <button
              onClick={dismissRefinement}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dm ? 'text-gray-400 hover:text-gray-200 bg-zinc-700' : 'text-gray-500 hover:text-gray-700 bg-gray-200'}`}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleRefine}
          disabled={refining}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 disabled:opacity-50"
          style={{
            backgroundColor: `${accentColor}15`,
            color: accentColor,
            border: `1px solid ${accentColor}30`,
          }}
        >
          {refining ? (
            <>
              <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
              Refining...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Refine with AI
            </>
          )}
        </button>

        <button
          onClick={handleReset}
          disabled={isDefault}
          className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 ${dm ? 'text-gray-400 hover:text-gray-200 bg-zinc-800 border border-zinc-700' : 'text-gray-500 hover:text-gray-700 bg-gray-100 border border-gray-200'}`}
        >
          Reset to Default
        </button>

        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-30 ml-auto"
          style={{ backgroundColor: accentColor }}
        >
          {saving ? 'Saving...' : 'Save Prompt'}
        </button>
      </div>
    </div>
  );
}
