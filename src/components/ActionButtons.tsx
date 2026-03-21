'use client';

import { useState, useRef, useEffect } from 'react';
import { Lightbulb, MessageCircle, Mic, MicOff, X, ArrowUp } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionInstance = any;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActionButtonsProps {
  goalId: string | null;
  darkMode: boolean;
  accentColor: string;
  onThoughtAdded: () => void;
  compact?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── AddThoughtSheet ────────────────────────────────────────────────────────

function AddThoughtSheet({
  open,
  onClose,
  goalId,
  darkMode,
  accentColor,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  goalId: string | null;
  darkMode: boolean;
  accentColor: string;
  onAdded: () => void;
}) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setSpeechSupported(
      typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    );
  }, []);

  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
    if (!open) {
      setText('');
      stopListening();
    }
  }, [open]);

  function getSpeechRecognition(): SpeechRecognitionInstance | null {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return null;
    return new SR();
  }

  function startListening() {
    const recognition = getSpeechRecognition();
    if (!recognition) return;

    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setText(transcript);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stopListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }

  function toggleListening() {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || !goalId) return;

    setSubmitting(true);
    stopListening();

    try {
      const res = await fetch(`/api/goals/${goalId}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });

      if (res.ok) {
        setText('');
        onAdded();
        onClose();
      }
    } catch (err) {
      console.error('Failed to add thought:', err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`relative w-full max-w-lg animate-slide-up rounded-t-2xl p-5 pb-8 ${
          darkMode ? 'bg-zinc-900' : 'bg-white'
        }`}
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Handle bar */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-500/40" />

        <h3 className={`mb-3 text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Add a thought
        </h3>

        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's on your mind?"
            rows={2}
            className={`flex-1 resize-none rounded-xl border px-4 py-3 text-base outline-none transition-colors ${
              darkMode
                ? 'border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:border-zinc-500'
                : 'border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-gray-400'
            }`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />

          {speechSupported && (
            <button
              onClick={toggleListening}
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center self-end rounded-full transition-all ${
                listening ? 'animate-pulse-ring' : ''
              }`}
              style={{
                backgroundColor: listening ? accentColor : darkMode ? '#27272a' : '#f3f4f6',
                color: listening ? '#fff' : darkMode ? '#a1a1aa' : '#6b7280',
              }}
            >
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
          className="mt-3 w-full rounded-xl py-3 text-base font-medium text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: accentColor }}
        >
          {submitting ? 'Adding...' : 'Add to list'}
        </button>
      </div>
    </div>
  );
}

// ─── AskAboutListSheet ──────────────────────────────────────────────────────

function AskAboutListSheet({
  open,
  onClose,
  darkMode,
  accentColor,
}: {
  open: boolean;
  onClose: () => void;
  darkMode: boolean;
  accentColor: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
    if (!open) {
      setMessages([]);
      setInput('');
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });

      const data = await res.json();
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply || 'Sorry, something went wrong.',
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Chat panel */}
      <div
        className={`relative mt-auto flex h-[85dvh] w-full max-w-lg mx-auto flex-col animate-slide-up rounded-t-2xl ${
          darkMode ? 'bg-zinc-900' : 'bg-white'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-4 py-3 ${
          darkMode ? 'border-zinc-800' : 'border-gray-100'
        }`}>
          <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Ask about your list
          </h3>
          <button
            onClick={onClose}
            className={`rounded-full p-1 ${darkMode ? 'text-zinc-400 hover:text-white' : 'text-gray-400 hover:text-gray-900'}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <p className={`text-center text-sm mt-8 ${darkMode ? 'text-zinc-500' : 'text-gray-400'}`}>
              Ask anything about your tasks...
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'text-white'
                    : darkMode
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'bg-gray-100 text-gray-900'
                }`}
                style={
                  msg.role === 'user' ? { backgroundColor: accentColor } : undefined
                }
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className={`rounded-2xl px-4 py-2.5 text-sm ${
                darkMode ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-500'
              }`}>
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div
          className={`border-t px-4 py-3 ${darkMode ? 'border-zinc-800' : 'border-gray-100'}`}
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className={`flex-1 rounded-xl border px-4 py-2.5 text-base outline-none transition-colors ${
                darkMode
                  ? 'border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:border-zinc-500'
                  : 'border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:border-gray-400'
              }`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: accentColor }}
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ActionButtons ──────────────────────────────────────────────────────────

export default function ActionButtons({
  goalId,
  darkMode,
  accentColor,
  onThoughtAdded,
  compact = false,
}: ActionButtonsProps) {
  const [showThought, setShowThought] = useState(false);
  const [showChat, setShowChat] = useState(false);

  return (
    <>
      {compact ? (
        /* Compact: icon-only buttons for mobile header row */
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowThought(true)}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
              darkMode
                ? 'bg-zinc-800/80 active:bg-zinc-700'
                : 'bg-gray-100 active:bg-gray-200'
            }`}
          >
            <Lightbulb className="h-4 w-4" style={{ color: accentColor }} />
          </button>
          <button
            onClick={() => setShowChat(true)}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
              darkMode
                ? 'bg-zinc-800/80 active:bg-zinc-700'
                : 'bg-gray-100 active:bg-gray-200'
            }`}
          >
            <MessageCircle className="h-4 w-4" style={{ color: accentColor }} />
          </button>
        </div>
      ) : (
        /* Full-size: labeled buttons */
        <div className="flex gap-3 py-3">
          <button
            onClick={() => setShowThought(true)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 text-base font-medium transition-colors ${
              darkMode
                ? 'bg-zinc-800/80 text-zinc-100 active:bg-zinc-700'
                : 'bg-gray-100 text-gray-700 active:bg-gray-200'
            }`}
            style={{
              borderWidth: 1,
              borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}
          >
            <Lightbulb className="h-5 w-5" style={{ color: accentColor }} />
            Add thought
          </button>

          <button
            onClick={() => setShowChat(true)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-4 text-base font-medium transition-colors ${
              darkMode
                ? 'bg-zinc-800/80 text-zinc-100 active:bg-zinc-700'
                : 'bg-gray-100 text-gray-700 active:bg-gray-200'
            }`}
            style={{
              borderWidth: 1,
              borderColor: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}
          >
            <MessageCircle className="h-5 w-5" style={{ color: accentColor }} />
            Ask about list
          </button>
        </div>
      )}

      <AddThoughtSheet
        open={showThought}
        onClose={() => setShowThought(false)}
        goalId={goalId}
        darkMode={darkMode}
        accentColor={accentColor}
        onAdded={onThoughtAdded}
      />

      <AskAboutListSheet
        open={showChat}
        onClose={() => setShowChat(false)}
        darkMode={darkMode}
        accentColor={accentColor}
      />
    </>
  );
}
