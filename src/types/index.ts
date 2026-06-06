export interface User {
  id: string;
  phone_number: string;
  timezone: string;
  nudge_style: 'direct' | 'average' | 'gentle';
  active_hours_start: string;
  active_hours_end: string;
  outcome_target: string;
  google_calendar_token: string | null;
  google_calendar_refresh_token: string | null;
  accent_color: string;
  dark_mode: boolean;
  custom_prompt: string | null;
  focus: string | null;
  // Clinic hours = blackout windows carved out of active_hours (Phase 1).
  clinic_days: string;   // ISO dow CSV, 1=Mon..7=Sun, e.g. '1,2,3,4'
  clinic_start: string;  // 'HH:MM:SS'
  clinic_end: string;    // 'HH:MM:SS'
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  subtasks?: Subtask[];
}

export interface Subtask {
  id: string;
  goal_id: string;
  parent_id: string | null;
  title: string;
  is_completed: boolean;
  completed_at: string | null;
  position: number;
  created_at: string;
  ai_summary?: string | null;
  proposed_for_daily_at?: string | null;
  daily_response?: string | null;
  // Capacity tags assigned by generatePlan (Phase 1/3). Live on leaf to-dos.
  est_minutes?: number | null;
  lane?: 'practice' | 'dev' | null;
  priority?: number | null;
  is_emergency?: boolean;
  children?: Subtask[];
}

export interface SmsConversation {
  id: string;
  user_id: string;
  direction: 'outbound' | 'inbound';
  message_text: string;
  goal_context: Record<string, unknown> | null;
  sent_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action_type: string;
  goal_id: string | null;
  subtask_id: string | null;
  timestamp: string;
}

export interface SmartListItem {
  id: string;
  user_id: string;
  raw_subtask_id: string | null;
  title: string;
  priority: number;
  reasoning: string | null;
  is_completed: boolean;
  position: number;
  parent_id: string | null;
  created_at: string;
  children?: SmartListItem[];
}
