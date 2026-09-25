# GharKhoji Chat: Install Guide

Room seekers can now chat with the owner or agent of any room, live.

## What you get
- **Live chat** that appears instantly on the other phone (WebSocket), with **"typing…"** dots, **Seen ✓✓** ticks and **"Active now"**.
- A **Chats** tab with an unread badge and **All / Unread** filters. Each chat shows which room it's about.
- **"Chat with owner"** on every room page. If you already have a chat about that room, it opens that chat.
- **One-tap suggestions**: seekers get "Is this room still available?", "Can I visit this week?" and more; owners get "Yes, it's still available ✅" and more.
- A **push notification** when you're not in the app. Tapping it opens the chat.
- **Messages never get lost**: they show immediately, and if the internet drops they say "Not sent · Tap to retry", with no duplicates when retried.
- Works in **English and Nepali**.

### Safety and security
- **Your phone number is never shown** in chat.
- **Scam warning**: if a message asks for "advance", eSewa, Khalti, a bank transfer and so on, the reader sees a yellow warning. There's also a "never pay before visiting" note in every chat.
- **Block** and **Report**: reporting a scam, harassment, a fake listing or spam also blocks the person straight away.
- **Anti-spam**: at most 30 messages per minute and 30 new chats per day per person.
- **Private**: only the two people in a chat can open it. Anyone else gets "not found".
- The live connection logs in **inside the connection**, so the token never appears in a URL or log. It closes when the login expires and reconnects on its own.
- Invisible characters that could be used to fake text are removed.

---

## Install (about 5 minutes)

### 1. Stop Expo (Ctrl+C in Tab 2). Keep Docker running.

### 2. Copy the files in
Save `gharkhoji-chat.zip` to your Desktop, then in Ubuntu:
```bash
cd /tmp && rm -rf gk-chat && mkdir gk-chat && cd gk-chat
unzip -q /mnt/c/Users/User/OneDrive/Desktop/gharkhoji-chat.zip
cp -r /tmp/gk-chat/gharkhoji-chat/. ~/projects/gharkhoji/
```
This adds or replaces only the 25 files listed below, plus this guide. Nothing else changes.

### 3. Backend: create the chat tables
```bash
cd ~/projects/gharkhoji
docker compose restart api worker
docker compose logs api | grep "0005 -> 0006"
docker compose exec api pytest -q
```
Expected: `Running upgrade 0005 -> 0006, chat`, then **123 passed**.

### 4. Start the app
```bash
cd ~/projects/gharkhoji/mobile
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.70 npx expo start --lan --clear
```
No new packages are needed.

---

## Try it with one iPhone
1. Log in with **your own account**. Open any room → **Chat with owner** → tap a suggestion → send.
2. **Profile → Log out**, then log in as the owner: `9800000001`, password `gharkhoji123`.
3. The **Chats** tab shows a red badge. Open the chat and reply with a suggestion chip.
4. Send a message with the word **advance** or **eSewa**. The other side sees the scam warning.
5. **⋮ menu → Report** to see the report options.

To see **live** chat (typing dots, messages appearing instantly), use two phones, one logged in as each person. Any Android or iPhone with Expo Go can scan the same QR code.

**Tab 1** (`docker compose logs -f api worker`) shows `🔔 Push to user …` when someone gets a notification.

---

## Files in this update

### New files (15)
| File | What it does |
|---|---|
| `backend/app/modules/chat/__init__.py` | Makes the chat folder a Python module |
| `backend/app/modules/chat/models.py` | Conversation, Message and ChatReport tables |
| `backend/app/modules/chat/schemas.py` | What the API accepts and returns, plus message cleaning |
| `backend/app/modules/chat/service.py` | Chat rules, security, rate limits, scam detection |
| `backend/app/modules/chat/realtime.py` | Live delivery through Redis, and "Active now" |
| `backend/app/modules/chat/router.py` | REST endpoints and the `/chats/ws` WebSocket |
| `backend/alembic/versions/20260925_0006_chat.py` | Database migration |
| `backend/tests/test_chat.py` | 26 chat tests |
| `mobile/src/lib/chatTypes.ts` | Chat data types |
| `mobile/src/lib/chatSocket.ts` | The live connection (reconnects on its own) |
| `mobile/src/api/chat.ts` | Chat API hooks with instant sending |
| `mobile/src/components/chat.tsx` | Bubbles, typing dots, inbox rows, menus, message box |
| `mobile/src/app/(tabs)/chats.tsx` | The Chats tab (inbox) |
| `mobile/src/app/chat/[id].tsx` | A conversation |
| `mobile/src/app/chat/start/[listingId].tsx` | Starting a chat from a room |

### Updated files (10)
| File | What changed |
|---|---|
| `backend/app/main.py` | Registers the chat router (version 0.6.0) |
| `backend/app/models.py` | Registers the chat tables |
| `backend/app/core/deps.py` | The token check can now be reused by the WebSocket (same behaviour) |
| `mobile/src/app/_layout.tsx` | Starts the live chat connection; adds the chat screens |
| `mobile/src/app/(tabs)/_layout.tsx` | New **Chats** tab with unread badge |
| `mobile/src/components/TabBar.tsx` | Chat icon |
| `mobile/src/app/listing/[id]/index.tsx` | "Chat with owner / agent" button |
| `mobile/src/lib/push.ts` | Tapping a chat notification opens the chat |
| `mobile/src/i18n/en.json`, `ne.json` | English and Nepali text for chat |

**New tab layout**
- Seekers: Explore · Map · Saved · **Chats** · Profile
- Owners and agents: Explore · **Chats** · ＋ · My listings · Profile

## New API endpoints
| Endpoint | Purpose |
|---|---|
| `GET /chats` | My chats, newest first |
| `GET /chats/unread` | Numbers for the tab badge |
| `POST /chats` `{listing_id, body}` | Message a room's owner (reuses the existing chat) |
| `GET /chats/by-listing/{id}` | My chat about this room, if any |
| `GET /chats/{id}` | One chat |
| `GET /chats/{id}/messages?before=` | Messages, newest first, 30 per page |
| `POST /chats/{id}/messages` `{body, client_id}` | Send a message |
| `POST /chats/{id}/read` | Mark as read (the other person sees "Seen") |
| `POST /chats/{id}/block`, `/unblock` | Block or unblock |
| `POST /chats/{id}/report` `{reason, details}` | Report (also blocks) |
| `WS /chats/ws` | Live events: new message, seen, typing |

## If something goes wrong
| Problem | Fix |
|---|---|
| Red screen "Unable to resolve …/chatSocket" | A file is missing. Repeat step 2 |
| Chats tab is missing | Old bundle. Restart Expo with `--clear` |
| Messages only appear after pulling down to refresh | The live connection can't reach port 8000. Check `EXPO_PUBLIC_API_URL` in `mobile/.env` uses `192.168.1.70`. Chat still works, just not instantly |
| `relation "conversations" does not exist` | The migration didn't run. Run `docker compose restart api` and check step 3 |
| "You're sending messages too fast" | The anti-spam limit (30 per minute). Wait a minute |
