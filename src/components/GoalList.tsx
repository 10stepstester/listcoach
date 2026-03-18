'use client';

import { useState, useEffect, useRef, useCallback, DragEvent, TouchEvent as ReactTouchEvent } from 'react';
import type { Goal, Subtask } from '@/types/index';

function CheckIcon({ checked, size = 'sm', accentColor }: { checked: boolean; size?: 'sm' | 'lg'; accentColor?: string }) {
  const dim = size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';
  const svg = size === 'lg' ? 'w-4 h-4' : 'w-3 h-3';
  const color = accentColor || '#3b82f6';
  return (
    <div
      className={`${dim} rounded-md border-2 flex items-center justify-center cursor-pointer transition-all duration-300 ease-out`}
      style={{
        backgroundColor: checked ? color : 'transparent',
        borderColor: checked ? color : '#52525b',
        transform: checked ? 'scale(1.1)' : 'scale(1)',
        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      {checked && (
        <svg className={`${svg} text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );
}

// Fireworks celebration component
function Fireworks({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [onDone]);

  const particles = Array.from({ length: 40 }, (_, i) => {
    const angle = (i / 40) * 360 + (Math.random() * 20 - 10);
    const distance = 60 + Math.random() * 100;
    const size = 4 + Math.random() * 6;
    const delay = Math.random() * 0.3;
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const dx = Math.cos((angle * Math.PI) / 180) * distance;
    const dy = Math.sin((angle * Math.PI) / 180) * distance;
    return { dx, dy, size, delay, color, id: i };
  });

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      <div className="relative">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              left: '50%',
              top: '50%',
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              animation: `firework-particle 1.2s ${p.delay}s ease-out forwards`,
              ['--dx' as string]: `${p.dx}px`,
              ['--dy' as string]: `${p.dy}px`,
              opacity: 0,
            }}
          />
        ))}
        <div
          className="absolute w-16 h-16 rounded-full bg-emerald-400/30 -translate-x-1/2 -translate-y-1/2"
          style={{ animation: 'firework-flash 0.6s ease-out forwards' }}
        />
      </div>
      <div
        className="absolute text-3xl font-bold text-emerald-400"
        style={{
          animation: 'firework-text 2s ease-out forwards',
          textShadow: '0 0 20px rgba(16, 185, 129, 0.5)',
        }}
      >
        Goal Complete!
      </div>
    </div>
  );
}

function InlineEdit({
  value,
  onSave,
  className = '',
  placeholder = 'Untitled',
  autoEdit = false,
  onEditDone,
  darkMode = false,
  mobileSummary,
}: {
  value: string;
  onSave: (val: string) => void;
  className?: string;
  placeholder?: string;
  autoEdit?: boolean;
  onEditDone?: () => void;
  darkMode?: boolean;
  mobileSummary?: string | null;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(autoEdit ? '' : value);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (autoEdit && !editing) {
      setEditing(true);
      setDraft('');
    }
  }, [autoEdit]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      requestAnimationFrame(autoResize);
    }
  }, [editing, autoResize]);

  const commit = () => {
    setEditing(false);
    onEditDone?.();
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
  };

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        value={draft}
        rows={1}
        onChange={(e) => {
          setDraft(e.target.value);
          autoResize();
        }}
        onBlur={commit}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent, #3b82f6)';
          autoResize();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
            onEditDone?.();
          }
        }}
        className={`border rounded px-2 py-0.5 outline-none transition-colors w-full resize-none overflow-hidden ${darkMode ? 'bg-zinc-800 border-zinc-600' : 'bg-gray-100 border-gray-300'} ${className}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:opacity-80 transition-opacity ${className}`}
      title="Click to edit"
    >
      {/* Mobile: show AI summary if available, else line-clamp the full text */}
      {mobileSummary ? (
        <>
          <span className="sm:hidden line-clamp-1">{mobileSummary}</span>
          <span className="hidden sm:inline">{value || placeholder}</span>
        </>
      ) : (
        <>
          <span className="sm:hidden line-clamp-2">{value || placeholder}</span>
          <span className="hidden sm:inline">{value || placeholder}</span>
        </>
      )}
    </span>
  );
}

// Build tree from flat subtasks list
function buildSubtaskTree(flatSubtasks: Subtask[]): Subtask[] {
  const map = new Map<string, Subtask>();
  const roots: Subtask[] = [];

  flatSubtasks.forEach((s) => {
    map.set(s.id, { ...s, children: [] });
  });

  flatSubtasks.forEach((s) => {
    const node = map.get(s.id)!;
    if (s.parent_id && map.has(s.parent_id)) {
      map.get(s.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortChildren = (nodes: Subtask[]) => {
    nodes.sort((a, b) => a.position - b.position);
    nodes.forEach((n) => {
      if (n.children && n.children.length > 0) sortChildren(n.children);
    });
  };
  sortChildren(roots);

  return roots;
}

// Recursive subtask row component
function SubtaskRow({
  subtask,
  goalId,
  depth,
  accentColor,
  darkMode = false,
  editingSubtaskId,
  setEditingSubtaskId,
  toggleSubtask,
  updateSubtaskTitle,
  deleteSubtask,
  addChildSubtask,
  isDragging,
  isDragOver,
  subtaskRef,
}: {
  subtask: Subtask;
  goalId: string;
  depth: number;
  accentColor: string;
  darkMode?: boolean;
  editingSubtaskId: string | null;
  setEditingSubtaskId: (id: string | null) => void;
  toggleSubtask: (goalId: string, subtaskId: string, completed: boolean) => void;
  updateSubtaskTitle: (goalId: string, subtaskId: string, title: string) => void;
  deleteSubtask: (goalId: string, subtaskId: string) => void;
  addChildSubtask: (goalId: string, parentId: string) => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  subtaskRef?: (el: HTMLDivElement | null) => void;
}) {
  const children = subtask.children || [];
  const hasChildren = children.length > 0;
  const allChildrenDone = hasChildren && children.every((c) => c.is_completed);
  const isEffectivelyComplete = subtask.is_completed || (hasChildren && allChildrenDone);

  return (
    <div ref={depth === 0 ? subtaskRef : undefined} data-subtask-id={subtask.id}>
      <div
        className={`
          group relative flex items-center gap-3 px-3 py-2.5 sm:py-2 rounded-lg
          transition-all duration-150
          ${darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-100'}
          ${isEffectivelyComplete ? 'opacity-60' : ''}
          ${isDragging ? 'opacity-30 scale-[0.98]' : ''}
        `}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {isDragOver && (
          <div className="absolute left-1 right-1 -top-[1px] h-0.5 rounded-full z-10" style={{ backgroundColor: accentColor }} />
        )}
        <div onClick={() => toggleSubtask(goalId, subtask.id, !subtask.is_completed)}>
          <CheckIcon checked={isEffectivelyComplete} accentColor={accentColor} />
        </div>
        <div className="flex-1 min-w-0">
          <InlineEdit
            value={subtask.title}
            onSave={(title) => updateSubtaskTitle(goalId, subtask.id, title)}
            className={`text-sm ${isEffectivelyComplete ? (darkMode ? 'line-through text-zinc-500' : 'line-through text-gray-400') : (darkMode ? 'text-zinc-200' : 'text-gray-700')}`}
            autoEdit={editingSubtaskId === subtask.id}
            onEditDone={() => setEditingSubtaskId(null)}
            placeholder="What's the next step?"
            darkMode={darkMode}
            mobileSummary={subtask.ai_summary}
          />
        </div>
        {depth < 2 && (
          <button
            onClick={() => addChildSubtask(goalId, subtask.id)}
            className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-all p-1"
            style={{ color: accentColor }}
            title="Add sub-step"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
        <button
          onClick={() => deleteSubtask(goalId, subtask.id)}
          className={`opacity-70 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400 transition-all p-1 ${darkMode ? 'text-zinc-600' : 'text-gray-400'}`}
          title="Delete subtask"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {children.map((child) => (
        <SubtaskRow
          key={child.id}
          subtask={child}
          goalId={goalId}
          depth={depth + 1}
          accentColor={accentColor}
          darkMode={darkMode}
          editingSubtaskId={editingSubtaskId}
          setEditingSubtaskId={setEditingSubtaskId}
          toggleSubtask={toggleSubtask}
          updateSubtaskTitle={updateSubtaskTitle}
          deleteSubtask={deleteSubtask}
          addChildSubtask={addChildSubtask}
        />
      ))}
    </div>
  );
}

export default function GoalList({ accentColor = '#3b82f6', darkMode = false }: { accentColor?: string; darkMode?: boolean }) {
  const dm = darkMode;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [showFireworks, setShowFireworks] = useState(false);

  // Goal tab drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Subtask touch-drag state
  const [subDragId, setSubDragId] = useState<string | null>(null);
  const [subDragOverId, setSubDragOverId] = useState<string | null>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef<number>(0);
  const touchActiveRef = useRef<boolean>(false);
  const subtaskRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        const data = await res.json();
        const goalList = data.goals || [];
        setGoals(goalList);
        if (!activeTab && goalList.length > 0) {
          setActiveTab(goalList[0].id);
        }
      }
    } catch {
      // Network error
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const isGoalComplete = (goal: Goal) => {
    const subs = goal.subtasks || [];
    return subs.length > 0 && subs.every((s) => s.is_completed);
  };

  const addGoal = async () => {
    if (goals.length >= 3) return;
    const tempId = `temp-${Date.now()}`;
    const newGoal: Goal = {
      id: tempId,
      user_id: '',
      title: '',
      position: goals.length + 1,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      subtasks: [],
    };
    setGoals((prev) => [...prev, newGoal]);
    setActiveTab(tempId);
    setEditingGoalId(tempId);

    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled' }),
      });
      if (res.ok) {
        const data = await res.json();
        const created = data.goal;
        setGoals((prev) =>
          prev.map((g) => (g.id === tempId ? { ...created, subtasks: created.subtasks || [] } : g))
        );
        setActiveTab(created.id);
        setEditingGoalId(created.id);
      }
    } catch {
      setGoals((prev) => prev.filter((g) => g.id !== tempId));
    }
  };

  const updateGoalTitle = async (goalId: string, title: string) => {
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, title } : g)));
    try {
      await fetch('/api/goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: goalId, title }),
      });
    } catch {
      fetchGoals();
    }
  };

  const deleteGoal = async (goalId: string) => {
    const prev = goals;
    setGoals((g) => g.filter((goal) => goal.id !== goalId));
    setActiveTab(null);
    try {
      await fetch('/api/goals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: goalId }),
      });
    } catch {
      setGoals(prev);
    }
  };

  const toggleGoalComplete = (goalId: string) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const subs = goal.subtasks || [];
    if (subs.length === 0) return;

    const allComplete = subs.every((s) => s.is_completed);
    const newState = !allComplete;

    if (newState) setShowFireworks(true);

    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              subtasks: (g.subtasks || []).map((s) => ({
                ...s,
                is_completed: newState,
                completed_at: newState ? new Date().toISOString() : null,
              })),
            }
          : g
      )
    );

    subs.forEach((s) => {
      fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId: s.id, is_completed: newState }),
      }).catch(() => {});
    });
  };

  const reorderGoals = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const reordered = [...goals];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const updated = reordered.map((g, i) => ({ ...g, position: i + 1 }));
    setGoals(updated);

    try {
      await Promise.all(
        updated.map((g) =>
          fetch('/api/goals', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: g.id, position: g.position }),
          })
        )
      );
    } catch {
      fetchGoals();
    }
  };

  const reorderSubtasks = async (goalId: string, fromId: string, toId: string) => {
    if (fromId === toId) return;
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;

    // Only reorder root-level subtasks (no parent_id)
    const rootSubs = (goal.subtasks || [])
      .filter((s) => !s.parent_id)
      .sort((a, b) => a.position - b.position);

    const fromIndex = rootSubs.findIndex((s) => s.id === fromId);
    const toIndex = rootSubs.findIndex((s) => s.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...rootSubs];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Update positions
    const updatedSubs = reordered.map((s, i) => ({ ...s, position: i + 1 }));

    // Optimistically update UI
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== goalId) return g;
        const childSubs = (g.subtasks || []).filter((s) => s.parent_id);
        const newSubs = updatedSubs.map((us) => {
          const original = (g.subtasks || []).find((s) => s.id === us.id);
          return original ? { ...original, position: us.position } : us;
        });
        return { ...g, subtasks: [...newSubs, ...childSubs] };
      })
    );

    // Persist to server
    try {
      await Promise.all(
        updatedSubs.map((s) =>
          fetch(`/api/goals/${goalId}/subtasks`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subtaskId: s.id, position: s.position }),
          })
        )
      );
    } catch {
      fetchGoals();
    }
  };

  const addSubtask = async (goalId: string, parentId?: string) => {
    const tempId = `temp-sub-${Date.now()}`;
    const goal = goals.find((g) => g.id === goalId);
    const siblings = (goal?.subtasks || []).filter((s) =>
      parentId ? s.parent_id === parentId : !s.parent_id
    );
    const newSubtask: Subtask = {
      id: tempId,
      goal_id: goalId,
      parent_id: parentId || null,
      title: '',
      is_completed: false,
      completed_at: null,
      position: siblings.length + 1,
      created_at: new Date().toISOString(),
    };

    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId ? { ...g, subtasks: [...(g.subtasks || []), newSubtask] } : g
      )
    );
    setEditingSubtaskId(tempId);

    try {
      const body: Record<string, string> = { title: 'Untitled' };
      if (parentId) body.parent_id = parentId;

      const res = await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const created = data.subtask;
        setEditingSubtaskId(created.id);
        setGoals((prev) =>
          prev.map((g) =>
            g.id === goalId
              ? { ...g, subtasks: (g.subtasks || []).map((s) => (s.id === tempId ? created : s)) }
              : g
          )
        );
      }
    } catch {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === goalId
            ? { ...g, subtasks: (g.subtasks || []).filter((s) => s.id !== tempId) }
            : g
        )
      );
    }
  };

  const toggleSubtask = async (goalId: string, subtaskId: string, completed: boolean) => {
    const goal = goals.find((g) => g.id === goalId);
    if (goal && completed) {
      const subs = goal.subtasks || [];
      const othersComplete = subs.filter((s) => s.id !== subtaskId).every((s) => s.is_completed);
      if (othersComplete && subs.length > 0) {
        setShowFireworks(true);
      }
    }

    const goal2 = goals.find((g) => g.id === goalId);
    const allSubs = goal2?.subtasks || [];
    const childIds = new Set<string>();
    const collectChildren = (pid: string) => {
      allSubs.forEach((s) => {
        if (s.parent_id === pid) {
          childIds.add(s.id);
          collectChildren(s.id);
        }
      });
    };
    collectChildren(subtaskId);

    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? {
              ...g,
              subtasks: (g.subtasks || []).map((s) => {
                if (s.id === subtaskId || childIds.has(s.id)) {
                  return { ...s, is_completed: completed, completed_at: completed ? new Date().toISOString() : null };
                }
                return s;
              }),
            }
          : g
      )
    );

    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId, is_completed: completed }),
      });
    } catch {
      setGoals((prev) =>
        prev.map((g) =>
          g.id === goalId
            ? {
                ...g,
                subtasks: (g.subtasks || []).map((s) => {
                  if (s.id === subtaskId || childIds.has(s.id)) {
                    return { ...s, is_completed: !completed, completed_at: !completed ? new Date().toISOString() : null };
                  }
                  return s;
                }),
              }
            : g
        )
      );
    }
  };

  const updateSubtaskTitle = async (goalId: string, subtaskId: string, title: string) => {
    // Clear stale AI summary optimistically
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, subtasks: (g.subtasks || []).map((s) => (s.id === subtaskId ? { ...s, title, ai_summary: null } : s)) }
          : g
      )
    );

    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId, title }),
      });

      // Fire-and-forget: generate AI summary for long titles
      if (title.length > 60) {
        fetch(`/api/goals/${goalId}/subtasks/summarize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subtaskId, title }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.summary) {
              setGoals((prev) =>
                prev.map((g) =>
                  g.id === goalId
                    ? { ...g, subtasks: (g.subtasks || []).map((s) => (s.id === subtaskId ? { ...s, ai_summary: data.summary } : s)) }
                    : g
                )
              );
            }
          })
          .catch(() => {}); // Silently fail — CSS clamp is the fallback
      }
    } catch {
      fetchGoals();
    }
  };

  const deleteSubtask = async (goalId: string, subtaskId: string) => {
    const goal = goals.find((g) => g.id === goalId);
    const allSubs = goal?.subtasks || [];
    const toRemove = new Set<string>([subtaskId]);
    const collectChildren = (pid: string) => {
      allSubs.forEach((s) => {
        if (s.parent_id === pid) {
          toRemove.add(s.id);
          collectChildren(s.id);
        }
      });
    };
    collectChildren(subtaskId);

    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, subtasks: (g.subtasks || []).filter((s) => !toRemove.has(s.id)) }
          : g
      )
    );

    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId }),
      });
    } catch {
      fetchGoals();
    }
  };

  // Drag handlers
  const handleDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget) {
      e.dataTransfer.setDragImage(e.currentTarget, e.currentTarget.offsetWidth / 2, e.currentTarget.offsetHeight / 2);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      reorderGoals(dragIndex, dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  // Touch drag: long-press to initiate, then drag to reorder
  const subtaskListRef = useRef<HTMLDivElement>(null);
  const subDragIdRef = useRef<string | null>(null);

  const handleSubTouchStart = (e: ReactTouchEvent<HTMLDivElement>, subtaskId: string) => {
    const touch = e.touches[0];
    touchStartYRef.current = touch.clientY;
    touchActiveRef.current = false;

    // Start a 300ms timer for long-press detection
    touchTimerRef.current = setTimeout(() => {
      touchActiveRef.current = true;
      subDragIdRef.current = subtaskId;
      setSubDragId(subtaskId);
      // Vibrate for haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, 300);
  };

  const handleSubTouchEnd = () => {
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);

    if (touchActiveRef.current && subDragIdRef.current && subDragOverId && subDragIdRef.current !== subDragOverId && activeTab) {
      reorderSubtasks(activeTab, subDragIdRef.current, subDragOverId);
    }

    touchActiveRef.current = false;
    subDragIdRef.current = null;
    setSubDragId(null);
    setSubDragOverId(null);
  };

  // Attach non-passive touchmove on DOCUMENT to guarantee we can preventDefault before browser scrolls
  useEffect(() => {
    const handleTouchMove = (e: globalThis.TouchEvent) => {
      if (!touchActiveRef.current) {
        // Not dragging yet — cancel long-press if finger moved too far
        if (touchTimerRef.current) {
          const touch = e.touches[0];
          if (Math.abs(touch.clientY - touchStartYRef.current) > 10) {
            clearTimeout(touchTimerRef.current);
            touchTimerRef.current = null;
          }
        }
        return;
      }

      // Drag is active — prevent scrolling at the highest level
      e.preventDefault();
      e.stopPropagation();

      const touch = e.touches[0];
      const y = touch.clientY;

      // Find which subtask we're hovering over
      let hoveredId: string | null = null;
      subtaskRefsMap.current.forEach((refEl, id) => {
        if (id === subDragIdRef.current) return;
        const rect = refEl.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          hoveredId = id;
        }
      });
      setSubDragOverId(hoveredId);
    };

    // Document-level, capture phase, non-passive — intercepts before browser can scroll
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    return () => document.removeEventListener('touchmove', handleTouchMove, { capture: true });
  }, []);

  // Desktop HTML5 drag handlers for subtasks (kept for desktop support)
  const handleSubDragStart = (e: DragEvent<HTMLDivElement>, subtaskId: string) => {
    setSubDragId(subtaskId);
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  };

  const handleSubDragOver = (e: DragEvent<HTMLDivElement>, subtaskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setSubDragOverId(subtaskId);
  };

  const handleSubDragEnd = () => {
    if (subDragId && subDragOverId && subDragId !== subDragOverId && activeTab) {
      reorderSubtasks(activeTab, subDragId, subDragOverId);
    }
    setSubDragId(null);
    setSubDragOverId(null);
  };

  const handleSubDragLeave = () => {
    setSubDragOverId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // Build the 3 tab slots: fill with goals, rest are empty "+" slots
  const slots: (Goal | null)[] = [
    goals[0] || null,
    goals[1] || null,
    goals[2] || null,
  ];

  const activeGoal = goals.find((g) => g.id === activeTab) || null;

  return (
    <div className="w-full max-w-2xl mx-auto">
      {showFireworks && <Fireworks onDone={() => setShowFireworks(false)} />}

      {/* Card with shadow */}
      <div className={`rounded-xl transition-shadow duration-300 ${dm ? 'shadow-2xl shadow-black/50' : 'shadow-lg shadow-gray-200/80 ring-1 ring-gray-200'}`}>

        {/* Tab bar */}
        <div className={`grid grid-cols-3 rounded-t-xl overflow-hidden ${dm ? 'bg-zinc-900' : 'bg-gray-100'}`}>
          {slots.map((goal, idx) => {
            if (!goal) {
              return (
                <button
                  key={`empty-${idx}`}
                  onClick={addGoal}
                  className={`flex items-center justify-center gap-1.5 py-3.5 sm:py-3 transition-all duration-200 ${dm ? 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              );
            }

            const isActive = activeTab === goal.id;
            const goalDone = isGoalComplete(goal);
            const subtasks = goal.subtasks || [];
            const completed = subtasks.filter((s) => s.is_completed).length;
            const isDragging = dragIndex === idx;
            const isDragOver = dragOverIndex === idx && dragIndex !== idx;

            return (
              <div
                key={goal.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onDragLeave={handleDragLeave}
                className={`relative cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
              >
                {isDragOver && (
                  <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full" style={{ backgroundColor: accentColor }} />
                )}
                <button
                  onClick={() => setActiveTab(isActive ? null : goal.id)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (isActive) setEditingGoalId(goal.id);
                  }}
                  className={`
                    w-full flex flex-col items-center justify-center py-3.5 sm:py-3 px-2
                    text-sm font-medium transition-all duration-200 select-none
                    ${isActive
                      ? (dm ? 'bg-zinc-800 text-white' : 'bg-white text-gray-900')
                      : (dm ? 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200')
                    }
                  `}
                >
                  {isActive && (
                    <div
                      className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                      style={{ backgroundColor: accentColor }}
                    />
                  )}
                  {editingGoalId === goal.id ? (
                    <input
                      autoFocus
                      defaultValue={goal.title}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const val = e.currentTarget.value.trim();
                        if (val && val !== goal.title) updateGoalTitle(goal.id, val);
                        setEditingGoalId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = e.currentTarget.value.trim();
                          if (val && val !== goal.title) updateGoalTitle(goal.id, val);
                          setEditingGoalId(null);
                        }
                        if (e.key === 'Escape') setEditingGoalId(null);
                      }}
                      className={`text-xs sm:text-sm text-center w-full bg-transparent border-b outline-none ${dm ? 'border-zinc-500' : 'border-gray-400'}`}
                    />
                  ) : (
                    <span className={`truncate max-w-full text-xs sm:text-sm ${goalDone ? 'line-through opacity-80' : ''}`}>
                      {goalDone ? <span className="text-emerald-500">{goal.title || 'Untitled'}</span> : (goal.title || 'Untitled')}
                    </span>
                  )}
                  {subtasks.length > 0 && editingGoalId !== goal.id && (
                    <span className="text-[10px] sm:text-xs mt-0.5 opacity-50">
                      {completed}/{subtasks.length}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Content panel */}
        {activeGoal && (() => {
          const goal = activeGoal;
          const flatSubtasks = goal.subtasks || [];
          const tree = buildSubtaskTree(flatSubtasks);
          const goalDone = isGoalComplete(goal);

          return (
            <div className={`rounded-b-xl p-4 sm:p-5 animate-slide-down ${dm ? 'bg-zinc-800' : 'bg-white'}`}>
              {/* Subtasks tree */}
              <div className="space-y-0" ref={subtaskListRef}>
                {tree.map((subtask) => (
                  <div
                    key={subtask.id}
                    draggable
                    onDragStart={(e) => handleSubDragStart(e, subtask.id)}
                    onDragOver={(e) => handleSubDragOver(e, subtask.id)}
                    onDragEnd={handleSubDragEnd}
                    onDragLeave={handleSubDragLeave}
                    onTouchStart={(e) => handleSubTouchStart(e, subtask.id)}
                    onTouchEnd={handleSubTouchEnd}
                    className="cursor-grab active:cursor-grabbing select-none"
                    style={subDragId ? { touchAction: 'none' } : undefined}
                  >
                    <SubtaskRow
                      subtask={subtask}
                      goalId={goal.id}
                      depth={0}
                      accentColor={accentColor}
                      darkMode={dm}
                      editingSubtaskId={editingSubtaskId}
                      setEditingSubtaskId={setEditingSubtaskId}
                      toggleSubtask={toggleSubtask}
                      updateSubtaskTitle={updateSubtaskTitle}
                      deleteSubtask={deleteSubtask}
                      addChildSubtask={(gId, parentId) => addSubtask(gId, parentId)}
                      isDragging={subDragId === subtask.id}
                      isDragOver={subDragOverId === subtask.id && subDragId !== subtask.id}
                      subtaskRef={(el) => {
                        if (el) subtaskRefsMap.current.set(subtask.id, el);
                        else subtaskRefsMap.current.delete(subtask.id);
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => addSubtask(goal.id)}
                  className={`flex-1 flex items-center justify-center sm:justify-start gap-2 text-sm transition-colors px-3 py-3 sm:py-2 rounded-lg border sm:border-0 border-dashed ${dm ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border-zinc-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 border-gray-300'}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add subtask
                </button>
                <button
                  onClick={() => deleteGoal(goal.id)}
                  className={`p-2.5 rounded-lg transition-colors ${dm ? 'text-zinc-600 hover:text-red-400 hover:bg-white/5' : 'text-gray-300 hover:text-red-400 hover:bg-gray-100'}`}
                  title="Delete goal"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Empty state */}
        {!activeGoal && (
          <div className={`rounded-b-xl text-center py-12 sm:py-16 ${dm ? 'bg-zinc-800 text-zinc-600' : 'bg-white text-gray-400'}`}>
            {goals.length === 0 ? (
              <>
                <p className="text-base sm:text-lg mb-2">No goals yet</p>
                <p className="text-sm mb-4">Tap a <span className={dm ? 'text-zinc-400' : 'text-gray-500'}>+</span> above to add one</p>
              </>
            ) : (
              <p className="text-sm">Tap a goal above to see its steps</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
