# GharKhoji — Day 4 Guide: Posting, Map, Freshness

Goal: an owner posts a room **from the iPhone** (details, map pin, real photos, publish), it appears on the **map**, and a listing that isn't confirmed **disappears from search by itself**.

What was built and checked:
- **Backend:** freshness worker, push-token API, 10 new tests (**65 passing**). The worker was run live: 30 reminders sent, then 30 listings auto-hidden.
- **App:** TypeScript check clean, and full **iOS and Android** bundles build.

```
Owner posts ──▶ active ──(48h no confirm)──▶ "Still available?" reminder
                  ▲                              │ (every 12h)
                  │ tap "Yes, available"         ▼ (72h no confirm)
                  └──────────────────────── expired (hidden from search)
```

---

## PART A — Update (≈ 15 min)

**1.** Stop Expo (Ctrl+C) and the backend (Ctrl+C).

**2.** Extract `gharkhoji-day4.zip` on Windows, then copy it over your project:
```bash
cp -r /mnt/c/Users/User/OneDrive/Desktop/gharkhoji-day4/gharkhoji/. ~/projects/gharkhoji/
cd ~/projects/gharkhoji && ls
```
You should see `DAY4.md`. Your two `.env` files are not in the zip, so they stay as they are.

⚠️ **Important:** delete one old file. The listing screen moved into a folder today, and copying doesn't remove the old version:
```bash
rm ~/projects/gharkhoji/mobile/src/app/listing/\[id\].tsx
ls ~/projects/gharkhoji/mobile/src/app/listing/\[id\]/
```
The second command should show: `edit.tsx  index.tsx  photos.tsx`

**3.** Rebuild the backend (new package: `httpx`) and start it. It now runs a **4th container, `worker`**:
```bash
cd ~/projects/gharkhoji
docker compose up --build
```
Look for:
```
api-1     | Running upgrade 0002 -> 0003, freshness and push tokens
worker-1  | Worker started (every 600s)
```

**4.** Check the tests (second terminal):
```bash
cd ~/projects/gharkhoji
docker compose exec api pytest -q
```
Expected: **65 passed**.

**5.** Install the new app packages (photo picker, image resize, location, maps, notifications):
```bash
cd ~/projects/gharkhoji/mobile
rm -rf node_modules
npm install
```

**6.** Start the app:
```bash
npx expo start --tunnel --clear
```
Scan the QR code with the iPhone Camera → Expo Go. `--clear` is needed once because new native modules were added.

---

## PART B — Try it on your iPhone (≈ 30 min)

### 1. Map 🗺️
Open the **Map** tab.
- The pins show the monthly total (e.g. `15k`). Tap one → a card appears → **View room**.
- Drag or zoom the map, and the pins reload for the visible area.
- Tap **🎯** → allow location. If you're in the valley, the map jumps to you.

### 2. Post a room as an owner 📋
Log in as Ram (`9800000001`, code from the backend terminal). The **My listings** tab appears.
1. **+ Post**
2. Pick **1BHK**, and write a title (e.g. "Test room near my house").
3. Enter rent, deposit and the extra charges. Watch **"Estimated total per month"** update live.
4. Tap an area chip (e.g. **Koteshwor**): the map zooms there. **Tap or drag the pin** to the exact spot, or, if you're at home, tap **🎯 I'm at the house now**.
5. Choose facilities, then tap **Next: add photos →**
6. **Choose from gallery** → pick 2–3 photos → watch "Uploading 1 of 3…". iPhone HEIC photos are converted to ~300 KB JPEGs automatically. Tap **★** on another photo to make it the cover.
7. **🚀 Publish** → "Your listing is live!"
8. Go to **Home → Search** or the **Map**: your room is there, with your real photos. ✅

### 3. The freshness system ⏰ (today's core feature)
Waiting 2–3 days for real would be slow, so there's a helper that **pretends time has passed**.

**a) Make every listing look 50 hours old:**
```bash
cd ~/projects/gharkhoji
docker compose exec api python -m scripts.age_listing all 50
docker compose exec api python -m app.workers.main --once
```
In the output you'll see `🔔 Push to user … Is your room still available?` for each listing, and `Cycle done: 0 expired, 30 reminded`.

On the iPhone (pull down to refresh **My listings**):
- The tab shows a **red badge** with a number.
- A yellow banner says "N listings need your confirmation".
- Each listing asks **"Is this room still available?"** with **✅ Yes, available / 🏠 Rented**.
- Tap **Yes** on one → the question disappears and it's 🟢 "Confirmed 1 minute ago" again.

**b) Make them look 80 hours old (past the 72-hour limit):**
```bash
docker compose exec api python -m scripts.age_listing all 80
docker compose exec api python -m app.workers.main --once
```
Output: `Cycle done: 30 expired, 0 reminded`.
- **Home / Search / Map now show no listings** (they're all hidden).
- In **My listings** they show the red status "Hidden – confirm".
- Tap **Yes, available** on one → it's back in search immediately.

**c) Put everything back to normal:**
```bash
docker compose exec api python -m scripts.seed --reset
```

> In normal running, the worker checks every 10 minutes by itself. `--once` just runs it immediately.

### 4. Manage a listing
In **My listings**: **✏️ Edit** (same form, pre-filled), **📷** (add/remove photos, change cover), **🏠 Rented** (hides it), **🚀 Publish** (list it again), **🗑** (delete).

✅ **Day 4 is done when:** you posted a room with real photos from the iPhone, found it on the map, and watched it get a reminder → expire → come back with "Yes, available".

---

## PART C — Push notifications (optional)

The reminder is always visible **inside the app**. That works everywhere, and it's why Day 4 doesn't depend on push. Real push notifications (a banner on your lock screen) need 2 more things:

1. **An EAS project id** (free Expo account):
   ```bash
   cd ~/projects/gharkhoji/mobile
   npx eas-cli@latest init
   ```
   This adds `extra.eas.projectId` to `app.json`. Restart Expo.
2. **A phone that supports it inside Expo Go.** Expo Go has limits on remote push, especially on Android. If the token registers, you'll see a row in the database:
   ```bash
   docker compose exec db psql -U postgres -d gharkhoji -c "select platform, left(token, 30) from push_tokens;"
   ```
   If nothing appears, that's expected in Expo Go. Push will work fully in the **development/production build on Day 5** (EAS Build).

When a token *is* registered, run steps 3a/3b again and the notification arrives on the phone. Tapping it opens **My listings**.

---

## PART D — How it works (≈ 2 hours)

### Backend (read in this order)
| File | What to learn |
|---|---|
| `app/workers/availability.py` | **The core feature.** Two SQL steps: expire (UPDATE … RETURNING) and remind. Each step only touches rows that still need it, so running twice is harmless |
| `app/workers/main.py` | A long-running loop with a **Redis lock** (`SET NX EX`), so two workers can never run the same cycle |
| `app/modules/notifications/` | Push tokens (one per phone, **upsert** so a phone can switch accounts) and sending through Expo's push service. Dead tokens are cleaned up automatically |
| `app/modules/listings/models.py` | New `needs_confirmation` property, `reminder_sent_at`, `reminders_sent`, `expired_at` |
| `tests/test_freshness.py` | Every rule above as a test, using "time travel" by editing `last_confirmed_at` |

**Why not Celery?** For two simple periodic jobs, a small async loop in the same codebase is easier to run, test and debug. If you later need queues, retries and many job types, switch to a job library. The logic in `availability.py` stays the same.

### App
| File | What to learn |
|---|---|
| `src/components/ListingForm.tsx` | One form for create **and** edit; numbers typed as text and converted safely; live total; map pin (tap / drag / GPS) |
| `src/lib/upload.ts` | Pick → **resize to 1600 px JPEG** → the 3-step upload from Day 2 |
| `src/app/listing/[id]/photos.tsx` | Upload progress, delete, set cover, publish |
| `src/app/(tabs)/map.tsx` | Visible map area → a search circle (`radius_km`), price pins, bottom card |
| `src/app/(tabs)/mine.tsx` | The one-tap **"Is this room still available?"** question |
| `src/lib/push.ts` | Permission → Expo push token → saved to the backend; removed on logout |
| `src/app/(tabs)/_layout.tsx` | Tabs change by role (tenants don't see My listings) and show a **badge** for listings that need attention |

---

## PART E — Save to GitHub
```bash
cd ~/projects/gharkhoji
git add .
git commit -m "Day 4: post from phone, photo upload, map, freshness worker, push tokens"
git push
```

---

## If something goes wrong
| Problem | Fix |
|---|---|
| `worker-1 exited` / `ModuleNotFoundError` | You forgot `--build`: `docker compose up --build` |
| App: error about a **duplicate route** / `listing/[id]` | You skipped the ⚠️ step in Part A. Delete `mobile/src/app/listing/[id].tsx` |
| App: red screen mentioning `react-native-maps` or `ExpoImageManipulator` | Stop Expo and run `npx expo start --tunnel --clear`. Update Expo Go from the App Store |
| Photo upload fails | Check `PUBLIC_BASE_URL` in `backend/.env` is `http://YOUR_IP:8000` (not localhost), and that the backend is running |
| "Location must be inside Kathmandu Valley" | The pin is outside the valley. Move it |
| Map is empty | Pull down on **Home** to check the API works, zoom out, or run `scripts.seed --reset` |
| My listings tab is missing | You're logged in as a **tenant**. Log in as Ram (`9800000001`) |
| Tab badge doesn't update after the worker runs | Pull down to refresh on **My listings** |
