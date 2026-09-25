// Chat data shapes (match backend/app/modules/chat/schemas.py).
import type { ListingStatus, Role } from './types';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  client_id: string | null;
  flagged: boolean; // mentions paying up front → the app shows a safety warning
  created_at: string;
  // Only on this phone, while sending:
  pending?: boolean;
  failed?: boolean;
}

export interface Conversation {
  id: string;
  listing: {
    id: string;
    title: string;
    area: string;
    total_monthly_cost: number;
    cover_photo_url: string | null;
    status: ListingStatus;
  } | null;
  listing_title: string;
  other: { id: string; name: string | null; role: Role; phone_verified: boolean; online: boolean };
  my_side: 'tenant' | 'owner';
  last_message_preview: string | null;
  last_message_at: string | null;
  last_message_mine: boolean;
  unread_count: number;
  other_last_read_at: string | null;
  blocked: boolean;
  blocked_by_me: boolean;
  created_at: string;
}

export interface MessagePage {
  items: ChatMessage[]; // newest first
  has_more: boolean;
}

export type ReportReason = 'scam' | 'harassment' | 'fake_listing' | 'spam' | 'other';

/** Random id for each message we send, so a retry never creates a duplicate. */
export function newClientId(): string {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += hex[8 + ((Math.random() * 4) | 0)];
    else s += hex[(Math.random() * 16) | 0];
  }
  return s;
}
