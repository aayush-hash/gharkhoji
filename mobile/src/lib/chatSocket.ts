// The live chat connection (one WebSocket per logged-in phone).
//
// - Logs in by sending the access token as the first frame (never in the URL).
// - Reconnects automatically with back-off (1s, 2s, 4s … 30s).
// - When the access token expires (close code 4401) it refreshes the token and reconnects.
// - Pauses while the app is in the background; on return it reconnects and catches up.
// - Messages are SENT with normal HTTP requests; this socket only receives events.
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { chatKeys, patchConversation, upsertMessage } from '../api/chat';
import { api, API_URL } from './api';
import { useAuth } from './auth';
import type { ChatMessage } from './chatTypes';

const WS_URL = `${API_URL.replace(/^http/, 'ws')}/chats/ws`;
const PING_MS = 25_000;
export const TYPING_SHOW_MS = 4_000;

/** conversation id → when the other person last typed there */
export const useTyping = create<{ at: Record<string, number>; set: (id: string, t: number) => void }>((set) => ({
  at: {},
  set: (id, t) => set((s) => ({ at: { ...s.at, [id]: t } })),
}));

/** Which conversation is open on screen right now (its messages get marked read instantly). */
export const useOpenChat = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({
  id: null,
  set: (id) => set({ id }),
}));

type ChatEvent =
  | { type: 'ready' | 'pong' }
  | { type: 'message'; conversation_id: string; message: ChatMessage }
  | { type: 'read'; conversation_id: string; reader_id: string; read_at: string }
  | { type: 'typing'; conversation_id: string; user_id: string }
  | { type: 'conversation'; conversation_id: string };

class ChatSocket {
  private ws: WebSocket | null = null;
  private qc: QueryClient | null = null;
  private stopped = true;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastTyping: Record<string, number> = {};

  start(qc: QueryClient) {
    this.qc = qc;
    this.stopped = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  /** Tell the other person "typing…" (at most every 2 seconds). */
  sendTyping(conversationId: string) {
    const now = Date.now();
    if (now - (this.lastTyping[conversationId] ?? 0) < 2000) return;
    this.lastTyping[conversationId] = now;
    this.send({ type: 'typing', conversation_id: conversationId });
  }

  private send(frame: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  private clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
  }

  private connect() {
    const token = useAuth.getState().accessToken;
    if (!token || this.stopped) return;
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
    ws.onmessage = (e) => {
      try {
        this.handle(JSON.parse(String(e.data)) as ChatEvent);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = (e) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws !== ws) return; // an old socket we replaced
      this.ws = null;
      if (this.stopped) return;
      if (e.code === 4401) {
        // Token expired: any API call refreshes it (see lib/api.ts), then reconnect.
        api('/users/me')
          .catch(() => {})
          .finally(() => this.retry(300));
      } else {
        this.retry();
      }
    };
    ws.onerror = () => {}; // onclose follows and handles reconnecting
  }

  private retry(delay = Math.min(30_000, 1000 * 2 ** this.attempts)) {
    if (this.stopped || !useAuth.getState().accessToken) return;
    this.attempts += 1;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private handle(ev: ChatEvent) {
    const qc = this.qc;
    if (!qc) return;
    switch (ev.type) {
      case 'ready':
        this.attempts = 0;
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_MS);
        // Catch up on anything that arrived while we were disconnected
        qc.invalidateQueries({ queryKey: chatKeys.all });
        break;
      case 'message': {
        upsertMessage(qc, ev.conversation_id, ev.message);
        const mine = ev.message.sender_id === useAuth.getState().user?.id;
        if (!mine) useTyping.getState().set(ev.conversation_id, 0);
        const open = useOpenChat.getState().id === ev.conversation_id;
        patchConversation(qc, ev.conversation_id, {
          last_message_preview: ev.message.body.slice(0, 140),
          last_message_at: ev.message.created_at,
          last_message_mine: mine,
        });
        qc.invalidateQueries({ queryKey: chatKeys.list });
        if (!open) qc.invalidateQueries({ queryKey: chatKeys.unread });
        break;
      }
      case 'read':
        patchConversation(qc, ev.conversation_id, { other_last_read_at: ev.read_at });
        break;
      case 'typing':
        useTyping.getState().set(ev.conversation_id, Date.now());
        break;
      case 'conversation':
        qc.invalidateQueries({ queryKey: chatKeys.all });
        break;
    }
  }
}

export const chatSocket = new ChatSocket();

/** Keep the live connection open while logged in and the app is in the foreground. */
export function useChatRealtime() {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id);
  useEffect(() => {
    if (!userId) {
      chatSocket.stop();
      return;
    }
    chatSocket.start(qc);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') chatSocket.start(qc);
      else if (state === 'background') chatSocket.stop();
    });
    return () => {
      sub.remove();
      chatSocket.stop();
    };
  }, [userId, qc]);
}
