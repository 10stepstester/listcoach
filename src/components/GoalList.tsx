'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Subtask, SmartListItem } from '@/types/index';

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

function InlineEdit({
  value,
  onSave,
  className = '',
  placeholder = 'Untitled',
  autoEdit = false,
  onEditDone,
  darkMode = false,
}: {
  value: string;
  onSave: (val: string) => void;
  className?: string;
  placeholder?: string;
  autoEdit?: boolean;
  onEditDone?: () => void;
  darkMode?: boolean;
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
      {value || placeholder}
    </span>
  );
}

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
    nodes.sort((a, b) => {
      // Completed items sink to the bottom
      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
      return a.position - b.position;
    });
    nodes.forEach((n) => {
      if (n.children && n.children.length > 0) sortChildren(n.children);
    });
  };
  sortChildren(roots);

  return roots;
}

function buildSmartTree(items: SmartListItem[]): SmartListItem[] {
  const map = new Map<string, SmartListItem>();
  const roots: SmartListItem[] = [];

  items.forEach((item) => map.set(item.id, { ...item, children: [] }));
  items.forEach((item) => {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  roots.sort((a, b) => a.position - b.position);
  return roots;
}

// Subtask row for the Raw To-dos tab
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
}: {
  subtask: Subtask;
  goalId: string;
  depth: number;
  accentColor: string;
  darkMode?: boolean;
  editingSubtaskId: string | null;
  setEditingSubtaskId: (id: string | null) => void;
  toggleSubtask: (subtaskId: string, completed: boolean) => void;
  updateSubtaskTitle: (subtaskId: string, title: string) => void;
  deleteSubtask: (subtaskId: string) => void;
  addChildSubtask: (parentId: string) => void;
}) {
  const children = subtask.children || [];
  const hasChildren = children.length > 0;
  const allChildrenDone = hasChildren && children.every((c) => c.is_completed);
  const isEffectivelyComplete = subtask.is_completed || (hasChildren && allChildrenDone);

  return (
    <div data-subtask-id={subtask.id}>
      <div
        className={`
          group relative flex items-center gap-3 px-3 py-2.5 sm:py-2 rounded-lg
          transition-all duration-150
          ${darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-100'}
          ${isEffectivelyComplete ? 'opacity-60' : ''}
        `}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        <div onClick={() => toggleSubtask(subtask.id, !subtask.is_completed)}>
          <CheckIcon checked={isEffectivelyComplete} accentColor={accentColor} />
        </div>
        <div className="flex-1 min-w-0">
          <InlineEdit
            value={subtask.title}
            onSave={(title) => updateSubtaskTitle(subtask.id, title)}
            className={`text-sm ${isEffectivelyComplete ? (darkMode ? 'line-through text-zinc-500' : 'line-through text-gray-400') : (darkMode ? 'text-zinc-200' : 'text-gray-700')}`}
            autoEdit={editingSubtaskId === subtask.id}
            onEditDone={() => setEditingSubtaskId(null)}
            placeholder="What needs to be done?"
            darkMode={darkMode}
          />
        </div>
        {depth < 2 && (
          <button
            onClick={() => addChildSubtask(subtask.id)}
            className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-all p-1"
            style={{ color: accentColor }}
            title="Add sub-item"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
        <button
          onClick={() => deleteSubtask(subtask.id)}
          className={`opacity-70 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-400 transition-all p-1 ${darkMode ? 'text-zinc-600' : 'text-gray-400'}`}
          title="Delete"
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

// Smart list item row
function SmartItemRow({
  item,
  depth,
  accentColor,
  darkMode = false,
  onToggle,
}: {
  item: SmartListItem;
  depth: number;
  accentColor: string;
  darkMode?: boolean;
  onToggle: (itemId: string, completed: boolean) => void;
}) {
  const children = item.children || [];
  return (
    <div>
      <div
        className={`
          group flex items-start gap-3 px-3 py-2.5 sm:py-2 rounded-lg
          transition-all duration-150
          ${darkMode ? 'hover:bg-white/5' : 'hover:bg-gray-100'}
          ${item.is_completed ? 'opacity-60' : ''}
        `}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        <div className="mt-0.5" onClick={() => onToggle(item.id, !item.is_completed)}>
          <CheckIcon checked={item.is_completed} accentColor={accentColor} />
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-sm ${item.is_completed ? (darkMode ? 'line-through text-zinc-500' : 'line-through text-gray-400') : (darkMode ? 'text-zinc-200' : 'text-gray-700')}`}>
            {item.title}
          </span>
          {item.reasoning && (
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-gray-400'}`}>
              {item.reasoning}
            </p>
          )}
        </div>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${darkMode ? 'bg-zinc-700 text-zinc-400' : 'bg-gray-100 text-gray-500'}`}
          title="Priority"
        >
          P{item.priority}
        </span>
      </div>
      {children.map((child) => (
        <SmartItemRow
          key={child.id}
          item={child}
          depth={depth + 1}
          accentColor={accentColor}
          darkMode={darkMode}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

type Tab = 'raw' | 'smart';

export default function GoalList({ accentColor = '#3b82f6', darkMode = false }: { accentColor?: string; darkMode?: boolean }) {
  const dm = darkMode;
  const [activeTab, setActiveTab] = useState<Tab>('raw');
  const [loading, setLoading] = useState(true);

  // Raw to-dos state
  const [goalId, setGoalId] = useState<string | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);

  // Smart list state
  const [smartItems, setSmartItems] = useState<SmartListItem[]>([]);
  const [smartLoading, setSmartLoading] = useState(false);

  // Fetch the single goal + subtasks
  const fetchGoal = useCallback(async () => {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        const data = await res.json();
        const goal = data.goal;
        if (goal) {
          setGoalId(goal.id);
          setSubtasks(goal.subtasks || []);
        }
      }
    } catch {
      // Network error
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch smart list
  const fetchSmartList = useCallback(async () => {
    try {
      const res = await fetch('/api/smart-list');
      if (res.ok) {
        const data = await res.json();
        setSmartItems(data.items || []);
      }
    } catch {
      // Network error
    }
  }, []);

  useEffect(() => {
    fetchGoal();
    fetchSmartList();
  }, [fetchGoal, fetchSmartList]);

  // Regenerate smart list (called after adding items)
  const regenerateSmartList = async () => {
    setSmartLoading(true);
    try {
      const res = await fetch('/api/smart-list', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSmartItems(data.items || []);
      }
    } catch {
      // Silently fail
    } finally {
      setSmartLoading(false);
    }
  };

  // --- Raw to-do operations ---

  const addSubtask = async (parentId?: string) => {
    if (!goalId) return;
    const tempId = `temp-sub-${Date.now()}`;
    const siblings = subtasks.filter((s) =>
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

    setSubtasks((prev) => [...prev, newSubtask]);
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
        setSubtasks((prev) => prev.map((s) => (s.id === tempId ? created : s)));
        // Regenerate smart list in background
        regenerateSmartList();
      }
    } catch {
      setSubtasks((prev) => prev.filter((s) => s.id !== tempId));
    }
  };

  const toggleSubtask = async (subtaskId: string, completed: boolean) => {
    if (!goalId) return;

    // Cascade to children
    const childIds = new Set<string>();
    const collectChildren = (pid: string) => {
      subtasks.forEach((s) => {
        if (s.parent_id === pid) {
          childIds.add(s.id);
          collectChildren(s.id);
        }
      });
    };
    collectChildren(subtaskId);

    setSubtasks((prev) =>
      prev.map((s) => {
        if (s.id === subtaskId || childIds.has(s.id)) {
          return { ...s, is_completed: completed, completed_at: completed ? new Date().toISOString() : null };
        }
        return s;
      })
    );

    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId, is_completed: completed }),
      });
    } catch {
      fetchGoal();
    }
  };

  const updateSubtaskTitle = async (subtaskId: string, title: string) => {
    if (!goalId) return;

    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, title } : s))
    );

    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId, title }),
      });
      // Regenerate smart list since content changed
      regenerateSmartList();
    } catch {
      fetchGoal();
    }
  };

  const deleteSubtask = async (subtaskId: string) => {
    if (!goalId) return;

    const toRemove = new Set<string>([subtaskId]);
    const collectChildren = (pid: string) => {
      subtasks.forEach((s) => {
        if (s.parent_id === pid) {
          toRemove.add(s.id);
          collectChildren(s.id);
        }
      });
    };
    collectChildren(subtaskId);

    setSubtasks((prev) => prev.filter((s) => !toRemove.has(s.id)));

    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId }),
      });
      regenerateSmartList();
    } catch {
      fetchGoal();
    }
  };

  // --- Smart list operations ---

  const toggleSmartItem = async (itemId: string, completed: boolean) => {
    // Optimistic update (flatten tree, update, rebuild)
    const flatten = (items: SmartListItem[]): SmartListItem[] =>
      items.flatMap((i) => [i, ...flatten(i.children || [])]);
    const flat = flatten(smartItems);
    const toggled = flat.find((i) => i.id === itemId);
    const updated = flat.map((i) => (i.id === itemId ? { ...i, is_completed: completed } : i));
    setSmartItems(buildSmartTree(updated));

    // Sync to raw subtasks locally so Raw To-dos reflects it immediately
    if (toggled?.raw_subtask_id) {
      const rawId = toggled.raw_subtask_id;
      const childIds = new Set<string>();
      const collectChildren = (pid: string) => {
        subtasks.forEach((s) => {
          if (s.parent_id === pid) {
            childIds.add(s.id);
            collectChildren(s.id);
          }
        });
      };
      collectChildren(rawId);

      setSubtasks((prev) =>
        prev.map((s) => {
          if (s.id === rawId || childIds.has(s.id)) {
            return { ...s, is_completed: completed, completed_at: completed ? new Date().toISOString() : null };
          }
          return s;
        })
      );
    }

    try {
      await fetch('/api/smart-list', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, is_completed: completed }),
      });
    } catch {
      fetchSmartList();
      fetchGoal();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const tree = buildSubtaskTree(subtasks);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className={`rounded-xl transition-shadow duration-300 ${dm ? 'shadow-2xl shadow-black/50' : 'shadow-lg shadow-gray-200/80 ring-1 ring-gray-200'}`}>

        {/* Two-tab bar */}
        <div className={`grid grid-cols-2 rounded-t-xl overflow-hidden ${dm ? 'bg-zinc-900' : 'bg-gray-100'}`}>
          {(['raw', 'smart'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const label = tab === 'raw' ? 'Raw To-dos' : 'Smart List';
            const count = tab === 'raw' ? subtasks.length : smartItems.length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  relative flex flex-col items-center justify-center py-3.5 sm:py-3 px-2
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
                <span className="text-xs sm:text-sm">{label}</span>
                {count > 0 && (
                  <span className="text-[10px] sm:text-xs mt-0.5 opacity-50">{count}</span>
                )}
                {tab === 'smart' && smartLoading && (
                  <div className="absolute top-2 right-3">
                    <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Content panel */}
        <div className={`rounded-b-xl p-4 sm:p-5 animate-slide-down ${dm ? 'bg-zinc-800' : 'bg-white'}`}>
          {activeTab === 'raw' && (
            <>
              {tree.length > 0 ? (
                <div className="space-y-0">
                  {tree.map((subtask) => (
                    <SubtaskRow
                      key={subtask.id}
                      subtask={subtask}
                      goalId={goalId || ''}
                      depth={0}
                      accentColor={accentColor}
                      darkMode={dm}
                      editingSubtaskId={editingSubtaskId}
                      setEditingSubtaskId={setEditingSubtaskId}
                      toggleSubtask={toggleSubtask}
                      updateSubtaskTitle={updateSubtaskTitle}
                      deleteSubtask={deleteSubtask}
                      addChildSubtask={(parentId) => addSubtask(parentId)}
                    />
                  ))}
                </div>
              ) : (
                <div className={`text-center py-8 ${dm ? 'text-zinc-600' : 'text-gray-400'}`}>
                  <p className="text-sm">No to-dos yet. Add one below.</p>
                </div>
              )}

              <button
                onClick={() => addSubtask()}
                className={`w-full flex items-center justify-center sm:justify-start gap-2 text-sm transition-colors px-3 py-3 sm:py-2 rounded-lg border sm:border-0 border-dashed mt-3 ${dm ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border-zinc-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 border-gray-300'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add item
              </button>
            </>
          )}

          {activeTab === 'smart' && (
            <>
              {smartItems.length > 0 ? (
                <div className="space-y-0">
                  {smartItems.map((item) => (
                    <SmartItemRow
                      key={item.id}
                      item={item}
                      depth={0}
                      accentColor={accentColor}
                      darkMode={dm}
                      onToggle={toggleSmartItem}
                    />
                  ))}
                </div>
              ) : (
                <div className={`text-center py-8 ${dm ? 'text-zinc-600' : 'text-gray-400'}`}>
                  {subtasks.length === 0 ? (
                    <p className="text-sm">Add some to-dos first, then check back here.</p>
                  ) : smartLoading ? (
                    <p className="text-sm">Organizing your list...</p>
                  ) : (
                    <p className="text-sm">No suggestions yet. Add more items to your Raw To-dos.</p>
                  )}
                </div>
              )}

              <button
                onClick={regenerateSmartList}
                disabled={smartLoading || subtasks.length === 0}
                className={`w-full flex items-center justify-center gap-2 text-sm transition-colors px-3 py-3 sm:py-2 rounded-lg mt-3 ${dm ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 disabled:opacity-30' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {smartLoading ? 'Reorganizing...' : 'Reorganize'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
