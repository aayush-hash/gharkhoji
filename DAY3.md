# GharKhoji — Day 3 Guide: The Phone App

Goal: open GharKhoji on your iPhone, browse the listings from your laptop, and log in with OTP.

The app is built with **Expo SDK 57** (React Native + TypeScript + Expo Router). It passed a full TypeScript check and a complete iOS bundle build. Today you install it, connect your iPhone to your laptop, and learn how it's organised.

```
iPhone (Expo Go)  ──Wi-Fi──▶  Windows laptop :8000  ──▶  Docker (FastAPI + Postgres + Redis)
      ▲
      └── app code comes from Metro (npx expo start) via a tunnel
```

---

## PART A — Update the project (≈ 10 min)

**1.** Stop nothing yet. The backend can keep running.

**2.** Extract `gharkhoji-day3.zip` on Windows (the same way you did for Day 2), then copy it over your project in Ubuntu:
```bash
cp -r /mnt/c/Users/User/OneDrive/Desktop/gharkhoji-day3/gharkhoji/. ~/projects/gharkhoji/
cd ~/projects/gharkhoji
ls mobile
```
You should see: `AGENTS.md  app.json  assets  package-lock.json  package.json  src  tsconfig.json`

**3.** Install the app's packages (2–4 minutes):
```bash
cd ~/projects/gharkhoji/mobile
npm install
```
Warnings are normal. Errors (red `ERR!`) are not. Paste those to me.

---

## PART B — Let your iPhone reach your laptop (≈ 20 min, the tricky part)

Your iPhone and laptop must be on the **same Wi-Fi**. The phone doesn't use a mobile data connection for this.

### Step 4. Find your laptop's Wi-Fi IP address
In **Windows PowerShell** (not Ubuntu):
```powershell
ipconfig
```
Find the section **"Wireless LAN adapter Wi-Fi"** and note its **IPv4 Address**, for example `192.168.1.67`.
We'll call this **YOUR_IP** from now on.

> Ignore addresses from "vEthernet (WSL)" or "Docker". Only the Wi-Fi one matters.

### Step 5. Open port 8000 in Windows Firewall
Open **PowerShell as Administrator** (right-click Start → Terminal (Admin)) and run:
```powershell
New-NetFirewallRule -DisplayName "GharKhoji API (dev)" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
```
Then make sure your Wi-Fi is set to **Private**: Settings → Network & internet → Wi-Fi → (your network) → **Network profile type: Private network**.

> Only use Private on your home Wi-Fi. Never set a café or public Wi-Fi to Private.

### Step 6. Test from the iPhone
On the iPhone, open **Safari** and go to:
```
http://YOUR_IP:8000/health
```
✅ You should see `{"status":"ok","database":"ok","redis":"ok"}`.
❌ If it doesn't load, don't continue. See "Phone can't reach the laptop" at the bottom.

### Step 7. Tell the backend its public address
Photo URLs must use your IP (not `localhost`), or the phone can't load them. In Ubuntu:
```bash
code ~/projects/gharkhoji/backend/.env
```
Change the `PUBLIC_BASE_URL` line to:
```
PUBLIC_BASE_URL=http://YOUR_IP:8000
```
Save, then restart the backend (Ctrl+C in its terminal, then `docker compose up`).

Photo URLs are built on every request, so all existing listings will use the new address automatically.

### Step 8. Tell the app where the backend is
```bash
cd ~/projects/gharkhoji/mobile
cp .env.example .env
code .env
```
Set your IP:
```
EXPO_PUBLIC_API_URL=http://YOUR_IP:8000/api/v1
```
Save.

> Your IP can change when you reconnect to Wi-Fi. If the app suddenly shows "Can't reach the server", check `ipconfig` again and update **both** `.env` files (Steps 7 and 8).

---

## PART C — Run it on your iPhone (≈ 10 min)

### Step 9. Start the app server (Metro)
Use a new Ubuntu terminal (the backend keeps running in the first):
```bash
cd ~/projects/gharkhoji/mobile
npx expo start --tunnel
```
- The first time, it asks to install `@expo/ngrok`. Type **y**.
- Why `--tunnel`? Metro runs inside WSL, which your phone can't reach directly. The tunnel sends the app code through the internet instead. It's a bit slower but works everywhere.
- When it's ready, a big **QR code** appears.

### Step 10. Open it on the iPhone
1. Make sure **Expo Go** is installed and up to date (App Store → Updates).
2. Open the iPhone **Camera** app and point it at the QR code, then tap the banner "Open in Expo Go".
3. **If iOS asks "Expo Go would like to find devices on your local network", tap Allow.** This is required, or the app can't reach YOUR_IP.
4. The first load takes 30–90 seconds (it's building the bundle). You'll see a progress bar in the terminal.

### Step 11. Try the whole flow
1. **Language screen** → pick **नेपाली** or **English**.
2. **Home**: you'll see area chips (Baneshwor, Koteshwor…), budget, type, and "Recently confirmed available" with photos from your seed data.
3. Pick **Koteshwor**, then **Up to Rs 20,000**, then **Search rooms**. You get a result list with distance, total monthly cost, and a 🟢 freshness badge.
4. Change the sort to **Nearest** or **Cheapest**. Pull down to refresh. Scroll to load more.
5. Tap a listing → **detail screen**: swipe the photos, see the cost breakdown, amenities, and "Listed by".
6. Tap **Log in to contact** → enter `9800000001` → **Send code**.
7. Look at the **backend terminal** for `📱 SMS to +9779800000001: Your GharKhoji code is ......` and type the code in the app. It submits automatically at 6 digits.
8. **Profile** tab: Ram Shrestha · Owner. Switch the language and watch every screen change.
9. **Log out**, then log in with a **new number** (for example `9812345678`). You'll see the **"Tell us about you"** onboarding screen (name + Tenant/Owner/Agent).
10. Close Expo Go completely and reopen it. You're **still logged in** (tokens are saved in the iPhone's encrypted Keychain).

✅ **Day 3 is done when steps 1–10 work on your iPhone.**

### Editing = instant updates
Open `mobile/src/app/(tabs)/index.tsx` in VS Code, change the `🏠` in the title to `🏡`, and save. The phone updates within a second or two, without reinstalling. This is "Fast Refresh".

---

## PART D — How the app is organised (≈ 2 hours, don't skip)

```
mobile/src/
├── app/                   ← every file here is a SCREEN (Expo Router: file = route)
│   ├── _layout.tsx        ← root: loads saved language + login, wraps everything in providers
│   ├── index.tsx          ← decides where to start (language screen? onboarding? home?)
│   ├── welcome.tsx        ← first launch: choose language
│   ├── (tabs)/            ← the bottom tab bar
│   │   ├── _layout.tsx    ← defines the tabs
│   │   ├── index.tsx      ← Home: areas, budget, type, freshest listings
│   │   └── profile.tsx    ← Profile: login/logout, language
│   ├── search.tsx         ← results list (infinite scroll, sort)
│   ├── listing/[id].tsx   ← listing detail ([id] = dynamic part of the URL)
│   ├── login.tsx          ← phone number
│   ├── verify.tsx         ← 6-digit code
│   └── onboarding.tsx     ← name + role for new users
├── api/hooks.ts           ← all server calls as React Query hooks (caching, loading, errors)
├── lib/
│   ├── api.ts             ← fetch wrapper: adds token, auto-refreshes it on 401, readable errors
│   ├── auth.ts            ← login state (Zustand), saved in SecureStore
│   ├── i18n.ts            ← English/Nepali setup
│   ├── format.ts          ← Rs 1,50,000 formatting, "confirmed 2 hours ago"
│   ├── theme.ts           ← colours and spacing in one place
│   └── types.ts           ← TypeScript types matching the backend's JSON
├── components/            ← reusable UI: Button, Chip, Field, ListingCard, badges
└── i18n/en.json, ne.json  ← all text. Never hard-code text in screens
```

### Read in this order
1. **`lib/api.ts`**: the most important file. See how a `401` triggers **one** silent token refresh, then retries the request. The user never notices the 15-minute access token expiring.
2. **`lib/auth.ts`**: where tokens live (memory + encrypted SecureStore), `signIn`, `signOut`, `hydrate` on app start.
3. **`api/hooks.ts`**: `useSearch` uses `useInfiniteQuery`, which gives page 1, 2, 3… as you scroll.
4. **`app/(tabs)/index.tsx`** then **`app/search.tsx`**: how the home filters become URL params for the search screen.
5. **`app/listing/[id].tsx`**: the cost card is the product's core promise, "what will I actually pay?".
6. **`i18n/ne.json`**: **please review the Nepali**. You're the native speaker. Fix anything that sounds unnatural.

### Design decisions worth knowing
- **Browse without an account.** Login is only needed to contact or post (from the product brief: "verify only when the action genuinely requires trust").
- **Tokens in SecureStore (the iOS Keychain)**, never in plain storage.
- **The approximate location only.** The app never receives the exact address.
- **Agents show an orange badge and their commission** on every listing.
- **Emoji icons** instead of an icon library: `@expo/vector-icons` had a version conflict with SDK 57, so this avoids one breaking dependency.

---

## PART E — Save to GitHub
```bash
cd ~/projects/gharkhoji
git status          # mobile/.env and mobile/node_modules must NOT appear
git add .
git commit -m "Day 3: Expo app — browse, search, listing detail, OTP login, Nepali/English"
git push
```

---

## If something goes wrong

### Phone can't reach the laptop (Step 6 fails)
1. Are both on the **same Wi-Fi**? (The phone isn't on mobile data, and the laptop isn't on Ethernet to a different router.)
2. Does `http://localhost:8000/health` work **on the laptop**? If not, the backend isn't running.
3. Is the firewall rule there, and is the Wi-Fi profile **Private**? (Step 5)
4. Some routers block devices from talking to each other ("AP isolation" / "client isolation"), which is common on guest networks. Use your main network, or your **iPhone's Personal Hotspot**: connect the laptop to the iPhone hotspot, run `ipconfig` again, and use the new IP.
5. As a last resort, temporarily turn off Windows Firewall for Private networks to test. If that fixes it, the rule in Step 5 was wrong. Turn the firewall back on afterwards.

### Other problems
| Problem | Fix |
|---|---|
| `npm install` shows `ERESOLVE` errors | Run `npm install --legacy-peer-deps` |
| QR code opens but shows "Project is incompatible with this version of Expo Go" | Update Expo Go from the App Store. The app uses SDK 57 |
| Tunnel: `ngrok tunnel took too long to connect` | Press Ctrl+C and run `npx expo start --tunnel` again. Or try without the tunnel (see below) |
| App shows "Can't reach the server…" | Your IP changed, or you didn't tap **Allow** for local network. Check iPhone Settings → Expo Go → **Local Network** is ON |
| Listings load but **photos are grey** | `PUBLIC_BASE_URL` in `backend/.env` is still `localhost`. Step 7 |
| Changes to `.env` don't apply | Stop Metro (Ctrl+C) and run `npx expo start --tunnel --clear` |
| Red error screen in the app | Take a screenshot and send it to me. It shows the file and line |

### Faster alternative to the tunnel (Windows 11 only)
WSL can share Windows' network directly ("mirrored mode"), so the phone reaches Metro over Wi-Fi without a tunnel:
1. In Windows, create or edit `C:\Users\User\.wslconfig` with:
   ```
   [wsl2]
   networkingMode=mirrored
   ```
2. In PowerShell: `wsl --shutdown`, then reopen Ubuntu and start Docker Desktop.
3. PowerShell (Admin): `New-NetFirewallRule -DisplayName "Expo Metro (dev)" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private`
4. Run `npx expo start` (no `--tunnel`) and scan the QR code.
