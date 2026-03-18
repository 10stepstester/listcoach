'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronRight, Plus, X, ArrowRight } from 'lucide-react';
import type { Subtask, SmartListItem } from '@/types/index';

// ─── CheckIcon ──────────────────────────────────────────────────────────────

function CheckIcon({
  checked,
  accentColor,
}: {
  checked: boolean;
  accentColor?: string;
}) {
  const color = accentColor || '#3b82f6';
  return (
    <div
      className="w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer flex-shrink-0"
      style={{
        backgroundColor: checked ? color : 'transparent',
        borderColor: checked ? color : '#a1a1aa',
        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: checked ? 'scale(1.08)' : 'scale(1)',
      }}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </div>
  );
}

// ─── InlineEdit ─────────────────────────────────────────────────────────────

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
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
  };

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        value={draft}
        rows={1}
        onChange={(e) => { setDraft(e.target.value); autoResize(); }}
        onBlur={commit}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent, #3b82f6)'; autoResize(); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setDraft(value); setEditing(false); onEditDone?.(); }
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
      {value || <span className="opacity-40">{placeholder}</span>}
    </span>
  );
}

// ─── Tree builders ───────────────────────────────────────────────────────────

function buildSubtaskTree(flatSubtasks: Subtask[]): Subtask[] {
  const map = new Map<string, Subtask>();
  const roots: Subtask[] = [];

  flatSubtasks.forEach((s) => map.set(s.id, { ...s, children: [] }));
  flatSubtasks.forEach((s) => {
    const node = map.get(s.id)!;
    if (s.parent_id && map.has(s.parent_id)) {
      map.get(s.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  const sort = (nodes: Subtask[]) => {
    nodes.sort((a, b) => {
      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
      return a.position - b.position;
    });
    nodes.forEach((n) => { if (n.children?.length) sort(n.children); });
  };
  sort(roots);
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

  const sort = (nodes: SmartListItem[]) => {
    nodes.sort((a, b) => {
      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
      return a.position - b.position;
    });
    nodes.forEach((n) => { if (n.children?.length) sort(n.children); });
  };
  sort(roots);
  return roots;
}

// ─── MoveDropdown ────────────────────────────────────────────────────────────

function MoveDropdown({
  categories,
  currentParentId,
  onMove,
  onClose,
  darkMode,
}: {
  categories: { id: string; title: string }[];
  currentParentId: string | null;
  onMove: (catId: string) => void;
  onClose: () => void;
  darkMode: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const available = categories.filter((c) => c.id !== currentParentId);

  return (
    <div
      ref={ref}
      className={`absolute right-0 top-7 z-50 min-w-[160px] rounded-lg shadow-lg border py-1 ${
        darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'
      }`}
    >
      {available.length === 0 ? (
        <p className={`px-3 py-2 text-xs ${darkMode ? 'text-zinc-500' : 'text-gray-400'}`}>No other categories</p>
      ) : (
        available.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onMove(cat.id)}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
              darkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            {cat.title || 'Untitled'}
          </button>
        ))
      )}
    </div>
  );
}

// ─── LongPressSheet ──────────────────────────────────────────────────────────

function LongPressSheet({
  subtask,
  categories,
  onEdit,
  onAddBelow,
  onMove,
  onClose,
  darkMode,
}: {
  subtask: Subtask;
  categories: { id: string; title: string }[];
  onEdit: () => void;
  onAddBelow: () => void;
  onMove: (catId: string) => void;
  onClose: () => void;
  darkMode: boolean;
}) {
  const [showMoveList, setShowMoveList] = useState(false);
  const available = categories.filter((c) => c.id !== subtask.parent_id);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      {/* Sheet */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-2xl pb-safe ${darkMode ? 'bg-zinc-900' : 'bg-white'}`}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className={`w-10 h-1 rounded-full ${darkMode ? 'bg-zinc-700' : 'bg-gray-300'}`} />
        </div>
        {/* Title */}
        <p className={`px-5 py-2 text-sm font-medium truncate ${darkMode ? 'text-zinc-300' : 'text-gray-600'}`}>
          {subtask.title || 'Untitled'}
        </p>
        <div className={`mx-4 h-px ${darkMode ? 'bg-zinc-800' : 'bg-gray-100'}`} />

        {!showMoveList ? (
          <div className="px-2 py-2 space-y-1">
            <button
              onClick={() => { onEdit(); onClose(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${darkMode ? 'text-zinc-200 hover:bg-zinc-800' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <svg className="w-4 h-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
            {available.length > 0 && (
              <button
                onClick={() => setShowMoveList(true)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${darkMode ? 'text-zinc-200 hover:bg-zinc-800' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <ArrowRight className="w-4 h-4 opacity-60" />
                Move to...
              </button>
            )}
            <button
              onClick={() => { onAddBelow(); onClose(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${darkMode ? 'text-zinc-200 hover:bg-zinc-800' : 'text-gray-700 hover:bg-gray-50'}`}
            >
              <Plus className="w-4 h-4 opacity-60" />
              Add item below
            </button>
          </div>
        ) : (
          <div className="px-2 py-2">
            <button
              onClick={() => setShowMoveList(false)}
              className={`flex items-center gap-2 px-4 py-2 text-sm mb-1 ${darkMode ? 'text-zinc-400' : 'text-gray-500'}`}
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" />
              Back
            </button>
            {available.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { onMove(cat.id); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors ${darkMode ? 'text-zinc-200 hover:bg-zinc-800' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {cat.title || 'Untitled'}
              </button>
            ))}
          </div>
        )}
        <div className="pb-6" />
      </div>
    </>
  );
}

// ─── SubtaskRow ──────────────────────────────────────────────────────────────

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
  addSiblingSubtask,
  moveSubtask,
  categories,
  isDragActive,
  collapsedIds,
  onToggleCollapse,
}: {
  subtask: Subtask;
  goalId: string;
  depth: number;
  accentColor: string;
  darkMode?: boolean;
  editingSubtaskId: string | null;
  setEditingSubtaskId: (id: string | null) => void;
  toggleSubtask: (id: string, completed: boolean) => void;
  updateSubtaskTitle: (id: string, title: string) => void;
  deleteSubtask: (id: string) => void;
  addChildSubtask: (parentId: string) => void;
  addSiblingSubtask: (siblingId: string) => void;
  moveSubtask: (id: string, newParentId: string) => void;
  categories: { id: string; title: string }[];
  isDragActive: boolean;
  collapsedIds: Set<string>;
  onToggleCollapse: (id: string) => void;
}) {
  const dm = darkMode;
  const children = subtask.children || [];
  const hasChildren = children.length > 0;
  const allChildrenDone = hasChildren && children.every((c) => c.is_completed);
  const isEffectivelyComplete = subtask.is_completed || (hasChildren && allChildrenDone);
  const isCategory = depth === 0;
  const isCollapsed = collapsedIds.has(subtask.id);

  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [longPressActive, setLongPressActive] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
    disabled: isEffectivelyComplete,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  const onTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      setLongPressActive(true);
      setShowSheet(true);
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    setLongPressActive(false);
  };

  const activeChildren = children.filter((c) => !c.is_completed);
  const completedChildren = children.filter((c) => c.is_completed);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`group relative flex items-center gap-1.5 py-2 rounded-lg transition-all duration-100
          ${dm ? 'hover:bg-white/5' : 'hover:bg-gray-50'}
          ${isEffectivelyComplete && !isCategory ? 'opacity-60' : ''}
          ${longPressActive ? 'scale-[1.01] shadow-md' : ''}
        `}
        style={{ paddingLeft: `${8 + depth * 20}px`, paddingRight: '8px' }}
        onTouchStart={onTouchStart}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
      >
        {/* Drag handle */}
        <button
          className={`flex-shrink-0 p-0.5 rounded cursor-grab active:cursor-grabbing transition-colors touch-none
            ${dm ? 'text-zinc-700 hover:text-zinc-400' : 'text-gray-300 hover:text-gray-500'}
          `}
          style={{ touchAction: 'none' }}
          {...attributes}
          {...listeners}
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>

        {/* Chevron for collapsible categories */}
        {isCategory ? (
          <button
            onClick={() => onToggleCollapse(subtask.id)}
            className={`flex-shrink-0 transition-transform duration-150 p-0.5 rounded
              ${dm ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600'}
            `}
          >
            <ChevronRight
              size={13}
              className={`transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`}
            />
          </button>
        ) : (
          <div className="w-5 flex-shrink-0" />
        )}

        {/* Checkbox */}
        <div
          onClick={() => toggleSubtask(subtask.id, !subtask.is_completed)}
          className="flex-shrink-0"
        >
          <CheckIcon checked={isEffectivelyComplete} accentColor={accentColor} />
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0 px-1">
          <InlineEdit
            value={subtask.title}
            onSave={(title) => updateSubtaskTitle(subtask.id, title)}
            className={`text-sm leading-snug ${isCategory ? 'font-medium' : 'font-normal'}
              ${isEffectivelyComplete
                ? (dm ? 'line-through text-zinc-500' : 'line-through text-gray-400')
                : (dm ? 'text-zinc-200' : 'text-gray-800')
              }`}
            autoEdit={editingSubtaskId === subtask.id}
            onEditDone={() => setEditingSubtaskId(null)}
            placeholder="What needs to be done?"
            darkMode={dm}
          />
        </div>

        {/* Category [+] — always visible */}
        {isCategory && (
          <button
            onClick={() => addChildSubtask(subtask.id)}
            className={`flex-shrink-0 p-1 rounded transition-colors
              ${dm ? 'text-zinc-600 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600'}
            `}
            title="Add task to this category"
          >
            <Plus size={13} />
          </button>
        )}

        {/* Hover-reveal actions (desktop + non-dragging) */}
        <div className={`flex items-center gap-0.5 flex-shrink-0 transition-opacity duration-150 ${
          isDragActive ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'
        }`}>
          {/* Add child — non-category, max depth 2 */}
          {!isCategory && depth < 2 && (
            <button
              onClick={() => addChildSubtask(subtask.id)}
              className={`p-1 rounded transition-colors ${dm ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600'}`}
              title="Add sub-item"
            >
              <Plus size={13} />
            </button>
          )}

          {/* Move to category — desktop only, non-category tasks */}
          {!isCategory && (
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowMoveDropdown(!showMoveDropdown)}
                className={`p-1 rounded transition-colors ${dm ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600'}`}
                title="Move to category"
              >
                <ArrowRight size={13} />
              </button>
              {showMoveDropdown && (
                <MoveDropdown
                  categories={categories}
                  currentParentId={subtask.parent_id}
                  onMove={(catId) => { moveSubtask(subtask.id, catId); setShowMoveDropdown(false); }}
                  onClose={() => setShowMoveDropdown(false)}
                  darkMode={dm}
                />
              )}
            </div>
          )}

          {/* Delete */}
          <button
            onClick={() => deleteSubtask(subtask.id)}
            className={`p-1 rounded transition-colors hover:text-red-400 ${dm ? 'text-zinc-600' : 'text-gray-400'}`}
            title="Delete"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Children (only when not collapsed) */}
      {!isCollapsed && !isEffectivelyComplete && (
        <>
          {activeChildren.length > 0 && (
            <SortableContext
              items={activeChildren.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {activeChildren.map((child) => (
                <SubtaskRow
                  key={child.id}
                  subtask={child}
                  goalId={goalId}
                  depth={depth + 1}
                  accentColor={accentColor}
                  darkMode={dm}
                  editingSubtaskId={editingSubtaskId}
                  setEditingSubtaskId={setEditingSubtaskId}
                  toggleSubtask={toggleSubtask}
                  updateSubtaskTitle={updateSubtaskTitle}
                  deleteSubtask={deleteSubtask}
                  addChildSubtask={addChildSubtask}
                  addSiblingSubtask={addSiblingSubtask}
                  moveSubtask={moveSubtask}
                  categories={categories}
                  isDragActive={isDragActive}
                  collapsedIds={collapsedIds}
                  onToggleCollapse={onToggleCollapse}
                />
              ))}
            </SortableContext>
          )}
          {completedChildren.length > 0 && (
            <div className="opacity-60">
              {completedChildren.map((child) => (
                <SubtaskRow
                  key={child.id}
                  subtask={child}
                  goalId={goalId}
                  depth={depth + 1}
                  accentColor={accentColor}
                  darkMode={dm}
                  editingSubtaskId={editingSubtaskId}
                  setEditingSubtaskId={setEditingSubtaskId}
                  toggleSubtask={toggleSubtask}
                  updateSubtaskTitle={updateSubtaskTitle}
                  deleteSubtask={deleteSubtask}
                  addChildSubtask={addChildSubtask}
                  addSiblingSubtask={addSiblingSubtask}
                  moveSubtask={moveSubtask}
                  categories={categories}
                  isDragActive={isDragActive}
                  collapsedIds={collapsedIds}
                  onToggleCollapse={onToggleCollapse}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Long-press bottom sheet (mobile) */}
      {showSheet && (
        <LongPressSheet
          subtask={subtask}
          categories={categories}
          onEdit={() => setEditingSubtaskId(subtask.id)}
          onAddBelow={() => addSiblingSubtask(subtask.id)}
          onMove={(catId) => moveSubtask(subtask.id, catId)}
          onClose={() => { setShowSheet(false); setLongPressActive(false); }}
          darkMode={dm}
        />
      )}
    </div>
  );
}

// ─── SmartItemRow ────────────────────────────────────────────────────────────

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
  const dm = darkMode;
  const children = item.children || [];
  return (
    <div>
      <div
        className={`group flex items-start gap-3 py-2 rounded-lg transition-all duration-150
          ${dm ? 'hover:bg-white/5' : 'hover:bg-gray-50'}
          ${item.is_completed ? 'opacity-60' : ''}
        `}
        style={{ paddingLeft: `${12 + depth * 20}px`, paddingRight: '8px' }}
      >
        <div className="mt-0.5 flex-shrink-0" onClick={() => onToggle(item.id, !item.is_completed)}>
          <CheckIcon checked={item.is_completed} accentColor={accentColor} />
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-sm ${item.is_completed
            ? (dm ? 'line-through text-zinc-500' : 'line-through text-gray-400')
            : (dm ? 'text-zinc-200' : 'text-gray-800')
          }`}>
            {item.title}
          </span>
        </div>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${dm ? 'bg-zinc-700 text-zinc-400' : 'bg-gray-100 text-gray-500'}`}>
          P{item.priority}
        </span>
      </div>
      {children.map((child) => (
        <SmartItemRow
          key={child.id}
          item={child}
          depth={depth + 1}
          accentColor={accentColor}
          darkMode={dm}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

// ─── GoalList ────────────────────────────────────────────────────────────────

type Tab = 'raw' | 'smart';

export default function GoalList({
  accentColor = '#3b82f6',
  darkMode = false,
}: {
  accentColor?: string;
  darkMode?: boolean;
}) {
  const dm = darkMode;
  const [activeTab, setActiveTab] = useState<Tab>('raw');
  const [loading, setLoading] = useState(true);

  // Raw to-dos state
  const [goalId, setGoalId] = useState<string | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);

  // Drag state
  const [isDragActive, setIsDragActive] = useState(false);

  // Collapsed category state
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const onToggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Smart list state
  const [smartItems, setSmartItems] = useState<SmartListItem[]>([]);
  const [smartLoading, setSmartLoading] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchGoal = useCallback(async () => {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        const data = await res.json();
        if (data.goal) {
          setGoalId(data.goal.id);
          setSubtasks(data.goal.subtasks || []);
        }
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  const fetchSmartList = useCallback(async () => {
    try {
      const res = await fetch('/api/smart-list');
      if (res.ok) {
        const data = await res.json();
        setSmartItems(data.items || []);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchGoal();
    fetchSmartList();
  }, [fetchGoal, fetchSmartList]);

  // ── Smart list regen ───────────────────────────────────────────────────────

  const regenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const regenerateSmartList = useCallback(() => {
    setSmartLoading(true);
    if (regenTimerRef.current) clearTimeout(regenTimerRef.current);
    regenTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/smart-list', { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setSmartItems(data.items || []);
        }
      } catch { /* silent */ }
      finally { setSmartLoading(false); }
    }, 800);
  }, []);

  // ── Raw to-do operations ───────────────────────────────────────────────────

  const addSubtask = async (parentId?: string) => {
    if (!goalId) return;
    const tempId = `temp-${Date.now()}`;
    const siblings = subtasks.filter((s) => parentId ? s.parent_id === parentId : !s.parent_id);
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
        regenerateSmartList();
      }
    } catch {
      setSubtasks((prev) => prev.filter((s) => s.id !== tempId));
    }
  };

  // Add a sibling directly below a given item
  const addSiblingSubtask = async (siblingId: string) => {
    const sibling = subtasks.find((s) => s.id === siblingId);
    if (!sibling) return;
    await addSubtask(sibling.parent_id || undefined);
  };

  const toggleSubtask = async (subtaskId: string, completed: boolean) => {
    if (!goalId) return;
    const childIds = new Set<string>();
    const collectChildren = (pid: string) => {
      subtasks.forEach((s) => { if (s.parent_id === pid) { childIds.add(s.id); collectChildren(s.id); } });
    };
    collectChildren(subtaskId);

    setSubtasks((prev) => prev.map((s) =>
      (s.id === subtaskId || childIds.has(s.id))
        ? { ...s, is_completed: completed, completed_at: completed ? new Date().toISOString() : null }
        : s
    ));
    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId, is_completed: completed }),
      });
      regenerateSmartList();
    } catch { fetchGoal(); }
  };

  const updateSubtaskTitle = async (subtaskId: string, title: string) => {
    if (!goalId) return;
    setSubtasks((prev) => prev.map((s) => (s.id === subtaskId ? { ...s, title } : s)));
    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId, title }),
      });
      regenerateSmartList();
    } catch { fetchGoal(); }
  };

  const deleteSubtask = async (subtaskId: string) => {
    if (!goalId) return;
    const toRemove = new Set<string>([subtaskId]);
    const collectChildren = (pid: string) => {
      subtasks.forEach((s) => { if (s.parent_id === pid) { toRemove.add(s.id); collectChildren(s.id); } });
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
    } catch { fetchGoal(); }
  };

  // Move a task to a different category (update parent_id)
  const moveSubtask = async (subtaskId: string, newParentId: string) => {
    if (!goalId) return;
    const siblings = subtasks.filter((s) => s.parent_id === newParentId);
    const newPosition = siblings.length + 1;
    setSubtasks((prev) => prev.map((s) =>
      s.id === subtaskId ? { ...s, parent_id: newParentId, position: newPosition } : s
    ));
    try {
      await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtaskId, parent_id: newParentId, position: newPosition }),
      });
      regenerateSmartList();
    } catch { fetchGoal(); }
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (_event: DragStartEvent) => {
    setIsDragActive(true);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setIsDragActive(false);
    const { active, over } = event;
    if (!over || active.id === over.id || !goalId) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const activeItem = subtasks.find((s) => s.id === activeId);
    const overItem = subtasks.find((s) => s.id === overId);

    if (!activeItem || !overItem) return;
    // Only reorder within same parent
    if (activeItem.parent_id !== overItem.parent_id) return;

    const parentId = activeItem.parent_id;
    const siblings = subtasks
      .filter((s) => s.parent_id === parentId && !s.is_completed)
      .sort((a, b) => a.position - b.position);

    const oldIndex = siblings.findIndex((s) => s.id === activeId);
    const newIndex = siblings.findIndex((s) => s.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(siblings, oldIndex, newIndex);
    const updates = reordered.map((s, i) => ({ id: s.id, position: i + 1 }));

    // Optimistic update
    setSubtasks((prev) => {
      const updated = new Map(updates.map((u) => [u.id, u.position]));
      return prev.map((s) => updated.has(s.id) ? { ...s, position: updated.get(s.id)! } : s);
    });

    // Persist each changed position
    await Promise.all(
      updates.map(({ id, position }) =>
        fetch(`/api/goals/${goalId}/subtasks`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subtaskId: id, position }),
        })
      )
    );
  };

  // ── Smart list operations ──────────────────────────────────────────────────

  const toggleSmartItem = async (itemId: string, completed: boolean) => {
    const flatten = (items: SmartListItem[]): SmartListItem[] =>
      items.flatMap((i) => [i, ...flatten(i.children || [])]);
    const flat = flatten(smartItems);
    const toggled = flat.find((i) => i.id === itemId);
    const updated = flat.map((i) => (i.id === itemId ? { ...i, is_completed: completed } : i));
    setSmartItems(buildSmartTree(updated));

    if (toggled?.raw_subtask_id) {
      const rawId = toggled.raw_subtask_id;
      const childIds = new Set<string>();
      const collectChildren = (pid: string) => {
        subtasks.forEach((s) => { if (s.parent_id === pid) { childIds.add(s.id); collectChildren(s.id); } });
      };
      collectChildren(rawId);
      setSubtasks((prev) => prev.map((s) =>
        (s.id === rawId || childIds.has(s.id))
          ? { ...s, is_completed: completed, completed_at: completed ? new Date().toISOString() : null }
          : s
      ));
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

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const tree = buildSubtaskTree(subtasks);
  const activeTree = tree.filter((s) => !s.is_completed);
  const completedTree = tree.filter((s) => s.is_completed);

  // Categories for move dropdown = all root-level items
  const categories = activeTree.map((s) => ({ id: s.id, title: s.title }));

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className={`rounded-xl transition-shadow duration-300 ${dm ? 'shadow-2xl shadow-black/50' : 'shadow-lg shadow-gray-200/80 ring-1 ring-gray-200'}`}>

        {/* Tab bar */}
        <div className={`grid grid-cols-2 rounded-t-xl overflow-hidden ${dm ? 'bg-zinc-900' : 'bg-gray-100'}`}>
          {(['raw', 'smart'] as const).map((tab) => {
            const isActive = activeTab === tab;
            const label = tab === 'raw' ? 'Raw To-dos' : 'Smart List';
            const count = tab === 'raw' ? subtasks.length : smartItems.length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative flex flex-col items-center justify-center py-3.5 sm:py-3 px-2
                  text-sm font-medium transition-all duration-200 select-none
                  ${isActive
                    ? (dm ? 'bg-zinc-800 text-white' : 'bg-white text-gray-900')
                    : (dm ? 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200')
                  }`}
              >
                {isActive && (
                  <div className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                    style={{ backgroundColor: accentColor }} />
                )}
                <span className="text-xs sm:text-sm">{label}</span>
                {count > 0 && <span className="text-[10px] sm:text-xs mt-0.5 opacity-50">{count}</span>}
                {tab === 'smart' && (
                  <div
                    className="absolute top-2 right-3"
                    onClick={(e) => { e.stopPropagation(); if (!smartLoading && subtasks.length > 0) regenerateSmartList(); }}
                    title="Refresh smart list"
                  >
                    {smartLoading ? (
                      <div className="w-3.5 h-3.5 border border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
                    ) : (
                      <svg className={`w-3.5 h-3.5 transition-opacity ${subtasks.length === 0 ? 'opacity-20' : 'opacity-40 hover:opacity-80 cursor-pointer'}`}
                        style={{ color: accentColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Content panel */}
        <div className={`rounded-b-xl p-3 sm:p-4 animate-slide-down ${dm ? 'bg-zinc-800' : 'bg-white'}`}>

          {/* ── Raw To-dos tab ── */}
          {activeTab === 'raw' && (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                {tree.length > 0 ? (
                  <div>
                    {/* Active root items */}
                    <SortableContext
                      items={activeTree.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {activeTree.map((subtask) => (
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
                          addChildSubtask={addSubtask}
                          addSiblingSubtask={addSiblingSubtask}
                          moveSubtask={moveSubtask}
                          categories={categories}
                          isDragActive={isDragActive}
                          collapsedIds={collapsedIds}
                          onToggleCollapse={onToggleCollapse}
                        />
                      ))}
                    </SortableContext>

                    {/* Completed section */}
                    {completedTree.length > 0 && (
                      <>
                        <div className={`flex items-center gap-2 pt-3 pb-1 px-1 ${dm ? 'text-zinc-500' : 'text-gray-400'}`}>
                          <div className={`flex-1 h-px ${dm ? 'bg-zinc-700' : 'bg-gray-200'}`} />
                          <span className="text-xs font-medium">Completed ({completedTree.length})</span>
                          <div className={`flex-1 h-px ${dm ? 'bg-zinc-700' : 'bg-gray-200'}`} />
                        </div>
                        <div className="opacity-60">
                          {completedTree.map((subtask) => (
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
                              addChildSubtask={addSubtask}
                              addSiblingSubtask={addSiblingSubtask}
                              moveSubtask={moveSubtask}
                              categories={categories}
                              isDragActive={isDragActive}
                              collapsedIds={collapsedIds}
                              onToggleCollapse={onToggleCollapse}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className={`text-center py-8 ${dm ? 'text-zinc-600' : 'text-gray-400'}`}>
                    <p className="text-sm">No to-dos yet. Add one below.</p>
                  </div>
                )}
              </DndContext>

              {/* Add item at bottom */}
              <button
                onClick={() => addSubtask()}
                className={`w-full flex items-center justify-center sm:justify-start gap-2 text-sm transition-colors
                  px-3 py-3 sm:py-2 rounded-lg border sm:border-0 border-dashed mt-3
                  ${dm ? 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border-zinc-700'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-gray-300'}`}
              >
                <Plus size={15} />
                Add item
              </button>
            </>
          )}

          {/* ── Smart List tab ── */}
          {activeTab === 'smart' && (
            <>
              {smartItems.length > 0 ? (() => {
                const activeSmartItems = smartItems.filter((i) => !i.is_completed);
                const completedSmartItems = smartItems.filter((i) => i.is_completed);
                return (
                  <div>
                    {activeSmartItems.map((item) => (
                      <SmartItemRow key={item.id} item={item} depth={0} accentColor={accentColor} darkMode={dm} onToggle={toggleSmartItem} />
                    ))}
                    {completedSmartItems.length > 0 && (
                      <>
                        <div className={`flex items-center gap-2 pt-3 pb-1 px-1 ${dm ? 'text-zinc-500' : 'text-gray-400'}`}>
                          <div className={`flex-1 h-px ${dm ? 'bg-zinc-700' : 'bg-gray-200'}`} />
                          <span className="text-xs font-medium">Completed ({completedSmartItems.length})</span>
                          <div className={`flex-1 h-px ${dm ? 'bg-zinc-700' : 'bg-gray-200'}`} />
                        </div>
                        <div className="opacity-60">
                          {completedSmartItems.map((item) => (
                            <SmartItemRow key={item.id} item={item} depth={0} accentColor={accentColor} darkMode={dm} onToggle={toggleSmartItem} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })() : (
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
