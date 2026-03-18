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
