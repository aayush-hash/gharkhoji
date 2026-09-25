// Chat API hooks. Messages appear instantly (optimistic) and are confirmed by the server;
// a message that fails stays in the list marked "Not sent — tap to retry".
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  type ChatMessage,
  type Conversation,
  type MessagePage,
  newClientId,
  type ReportReason,
} from '../lib/chatTypes';

export const chatKeys = {
  all: ['chats'] as const,
  list: ['chats', 'list'] as const,
  unread: ['chats', 'unread'] as const,
  one: (id: string) => ['chats', 'one', id] as const,
  byListing: (listingId: string) => ['chats', 'by-listing', listingId] as const,
  messages: (id: string) => ['chats', 'messages', id] as const,
};

type Pages = InfiniteData<MessagePage, string | null>;

/** Insert or replace a message in the cached pages (matches by id or by our client_id). */
export function upsertMessage(qc: QueryClient, conversationId: string, msg: ChatMessage) {
  qc.setQueryData<Pages>(chatKeys.messages(conversationId), (data) => {
    if (!data) return data;
    let found = false;
    const pages = data.pages.map((page) => ({
      ...page,
      items: page.items.map((m) => {
        if (m.id === msg.id || (msg.client_id && m.client_id === msg.client_id)) {
          found = true;
          return msg;
        }
        return m;
      }),
    }));
    if (!found && pages.length > 0) pages[0] = { ...pages[0], items: [msg, ...pages[0].items] };
    return { ...data, pages };
  });
}

function patchConversation(qc: QueryClient, id: string, patch: Partial<Conversation>) {
  qc.setQueryData<Conversation>(chatKeys.one(id), (c) => (c ? { ...c, ...patch } : c));
  qc.setQueryData<Conversation[]>(chatKeys.list, (list) => list?.map((c) => (c.id === id ? { ...c, ...patch } : c)));
}
export { patchConversation };

// ---------------- reading ----------------

export function useConversations() {
  const loggedIn = useAuth((s) => Boolean(s.user));
  return useQuery({
    queryKey: chatKeys.list,
    queryFn: () => api<Conversation[]>('/chats'),
    enabled: loggedIn,
    refetchInterval: 60_000, // backup in case the live connection drops
  });
}

export function useUnreadChats() {
  const loggedIn = useAuth((s) => Boolean(s.user));
  return useQuery({
    queryKey: chatKeys.unread,
    queryFn: () => api<{ unread_conversations: number; unread_messages: number }>('/chats/unread'),
    enabled: loggedIn,
    refetchInterval: 60_000,
  });
}

export function useConversation(id: string) {
  return useQuery({ queryKey: chatKeys.one(id), queryFn: () => api<Conversation>(`/chats/${id}`) });
}

/** Your existing chat about a room. Resolves to null if you haven't messaged yet. */
export function useConversationForListing(listingId: string) {
  return useQuery({
    queryKey: chatKeys.byListing(listingId),
    queryFn: async () => {
      try {
        return await api<Conversation>(`/chats/by-listing/${listingId}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
}

export function useMessages(id: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.messages(id),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<MessagePage>(`/chats/${id}/messages`, { query: { before: pageParam ?? undefined, limit: 30 } }),
    getNextPageParam: (last) =>
      last.has_more && last.items.length ? last.items[last.items.length - 1].created_at : undefined,
  });
}

// ---------------- writing ----------------

export function useSendMessage(conversationId: string) {
  const qc = useQueryClient();
  const myId = useAuth((s) => s.user?.id ?? '');
  return useMutation({
    mutationFn: (v: { body: string; client_id: string }) =>
      api<ChatMessage>(`/chats/${conversationId}/messages`, { method: 'POST', body: v }),
    onMutate: (v) => {
      upsertMessage(qc, conversationId, {
        id: `local-${v.client_id}`,
        conversation_id: conversationId,
        sender_id: myId,
        body: v.body,
        client_id: v.client_id,
        flagged: false,
        created_at: new Date().toISOString(),
        pending: true,
      });
    },
    onSuccess: (msg) => {
      upsertMessage(qc, conversationId, msg);
      patchConversation(qc, conversationId, {
        last_message_preview: msg.body.slice(0, 140),
        last_message_at: msg.created_at,
        last_message_mine: true,
      });
      qc.invalidateQueries({ queryKey: chatKeys.list });
    },
    onError: (_err, v) => {
      upsertMessage(qc, conversationId, {
        id: `local-${v.client_id}`,
        conversation_id: conversationId,
        sender_id: myId,
        body: v.body,
        client_id: v.client_id,
        flagged: false,
        created_at: new Date().toISOString(),
        failed: true,
      });
    },
  });
}

export function useStartChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { listing_id: string; body: string }) =>
      api<Conversation>('/chats', { method: 'POST', body: { ...v, client_id: newClientId() } }),
    onSuccess: (conv, v) => {
      qc.setQueryData(chatKeys.one(conv.id), conv);
      qc.setQueryData(chatKeys.byListing(v.listing_id), conv);
      qc.invalidateQueries({ queryKey: chatKeys.list });
    },
  });
}

export function useMarkRead(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/chats/${conversationId}/read`, { method: 'POST' }),
    onSuccess: () => {
      patchConversation(qc, conversationId, { unread_count: 0 });
      qc.invalidateQueries({ queryKey: chatKeys.unread });
    },
  });
}

export function useChatAction(conversationId: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: chatKeys.all });
  return {
    block: useMutation({
      mutationFn: () => api<void>(`/chats/${conversationId}/block`, { method: 'POST' }),
      onSuccess: done,
    }),
    unblock: useMutation({
      mutationFn: () => api<void>(`/chats/${conversationId}/unblock`, { method: 'POST' }),
      onSuccess: done,
    }),
    report: useMutation({
      mutationFn: (v: { reason: ReportReason; details?: string }) =>
        api<void>(`/chats/${conversationId}/report`, { method: 'POST', body: v }),
      onSuccess: done,
    }),
  };
}
