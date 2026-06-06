'use client';

import { useState, useEffect } from 'react';

interface Props {
  darkMode: boolean;
  accentColor: string;
}

type Plans = { v4: string; practice: string; amendments: string };

const SECTIONS: { key: keyof Plans; label: string; hint: string; rows: number }[] = [
  {
    key: 'v4',
    label: 'Dev Plan (v4)',
    hint: 'The 150-day software/build strategy. Ranks dev-lane nudges (evenings & weekends).',
    rows: 14,
  },
  {
    key: 'practice',
    label: 'Practice Cadence',
    hint: 'Clinic operator playbook. Ranks practice-lane nudges (reactivation, etc.) during clinic gaps.',
    rows: 8,
  },
  {
    key: 'amendments',
    label: 'Amendments',
    hint: 'Dated corrections that override the plan where they conflict.',
    rows: 5,
  },
];

export default function PlanEditor({ darkMode, accentColor }: Props) {
  const [plans, setPlans] = useState<Plans | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dm = darkMode;
  const inputBg = dm
    ? 'bg-zinc-800 border-zinc-700 text-white'
    : 'bg-gray-50 border-gray-300 text-gray-900';
  const labelColor = dm ? 'text-gray-300' : 'text-gray-700';
  const subText = dm ? 'text-gray-500' : 'text-gray-400';

  useEffect(() => {
    fetch('/api/plan')
      .then((r) => r.json())
      .then((j) => {
        if (j.plans) setPlans(j.plans);
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!plans) return;
    setSaving(true);
    try {
      const res = await fetch('/api/plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plans),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // save failed
    } finally {
      setSaving(false);
    }
  };

  if (!plans) {
    return <p className={`text-xs ${subText}`}>Loading plans…</p>;
  }

  return (
    <div className="space-y-4">
      <p className={`text-xs ${subText} -mt-1`}>
        These two playbooks rank your nudges. The choreographer reads them live — edits take
        effect on the next nudge, no deploy.
      </p>
      {SECTIONS.map((s) => (
        <div key={s.key}>
          <label className={`block text-sm font-medium ${labelColor} mb-1`}>{s.label}</label>
          <p className={`text-xs ${subText} mb-2`}>{s.hint}</p>
          <textarea
            value={plans[s.key]}
            onChange={(e) => setPlans({ ...plans, [s.key]: e.target.value })}
            rows={s.rows}
            spellCheck={false}
            className={`w-full px-3 py-2.5 ${inputBg} border rounded-lg outline-none transition-colors text-xs font-mono leading-relaxed resize-y`}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = accentColor;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '';
            }}
          />
        </div>
      ))}
      <button
        onClick={save}
        disabled={saving}
        className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-200 disabled:opacity-50"
        style={{ backgroundColor: accentColor }}
      >
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Plan'}
      </button>
    </div>
  );
}
