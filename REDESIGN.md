# GharKhoji — App Redesign Guide

A full visual and experience upgrade, modelled on patterns from the best property and booking apps (Airbnb, Zillow, NoBroker, Booking).

**Verified before shipping:**
- TypeScript check clean.
- iOS and Android bundles build.
- 73 backend tests pass.
- Every screen was rendered and reviewed at three sizes: small phone (360×640), iPhone (390×844) and tablet (820×1180).

---

## What's new

### Brand
- **Logo:** a map pin with a house inside and a coral door, meaning "find your home's location".
- **App icon, splash screen and Android adaptive icons** generated from the logo.
- **An animated intro** after the splash: the logo springs in and the name fades in.
- **A consistent design system** in `mobile/src/lib/theme.ts`: colours, spacing, corner radius, typography and shadows. Change the brand colour there and the whole app follows.

### Sign up and log in
```
Welcome slides ─▶ "How will you use GharKhoji?" ─▶ Phone (+977) ─▶ 6-digit code ─▶ Your name ─▶ App
   (3 slides)      Room seeker / Room owner / Agent    Step 2 of 3     Step 3 of 3    new users only
```
- **Language switch (EN / ने)** on the first screen.
- **"I'll just browse"** and **"Continue as guest"** options. Nobody is forced to sign up just to look.
- **The role is chosen up front** and pre-selected on the profile step.
- **The code input has 6 separate boxes.** It supports iOS "From Messages" autofill and paste, shakes and vibrates on a wrong code, has a resend timer, and a "Change number" link.
- **Returning users skip the name step** and go straight into the app.

### Navigation
- **A custom tab bar** with real icons:
  - **Seekers:** Explore · Map · Saved · Profile
  - **Owners and agents:** Explore · Map · **＋** · My listings · Profile. The raised centre button posts a room, and a badge shows listings that need confirmation.

### Explore (home)
- A greeting ("Good morning, Aayush") and a large search bar that overlaps the header.
- **Category icons:** Room · 1BHK · 2BHK · 3BHK · Flat.
- A **trust strip:** Verified owners · Confirmed daily · Full cost shown.
- **Carousels** of "Recently confirmed available" and "Budget picks" rooms.
- **Popular areas** as colourful tiles, labelled in both English and Nepali.
- An **owner banner**: "Have a room to rent? List it free".

### Search
- A text search box for title, area or landmark.
- Area chips, with the chosen area shown first.
- A **filter sheet** with sort order, room type, budget presets or min/max, distance and facilities. The filter button shows how many filters are active.
- Loading placeholders instead of spinners, an empty state, and a **2-column grid on tablets**.

### Room detail
- Full-width photo gallery with page dots, plus floating **Back**, **Share** and **♥ Save** buttons.
- A **trust row**: when availability was last confirmed, and "Phone verified".
- **Cost card:** every charge listed with an icon, the deposit, the agent's commission, and a "No hidden fees" note.
- A **facilities grid** with icons, a details list, and an approximate-area **map circle**. The exact house location is never shown.
- A "Listed by" card, and a **sticky price bar** with the main action button.

### New feature: Saved rooms ♥
- A heart on every card and on the detail screen. It fills **instantly**, before the server replies.
- A **Saved** tab for seekers. If a saved room gets rented, it stays in the list marked "No longer available".
- New backend endpoints: `PUT/DELETE /favorites/{id}`, `GET /favorites`, `GET /favorites/ids`.

### Profile
- A colourful header card with an avatar made from your initials and a role badge.
- A settings list: My listings, Post a room, Saved, Language, Safety tips, How GharKhoji works, Contact support, Log out.
- Guests see **Create an account** and **I already have an account**.

### Polish everywhere
- Real icons (Ionicons) instead of emoji.
- Soft shadows, rounded cards and gradients.
- Haptic taps on iPhone and Android.
- Every text in **English and Nepali**. Please review the Nepali in `mobile/src/i18n/ne.json`.

### Also included (fixes from today)
- The photo upload fix (native uploader), plus clear upload error messages.
- A token check that tolerates 60 seconds of clock difference, which fixes the WSL clock issue.
- Seed photos now look like illustrated rooms instead of flat colours.

---

## Install (≈ 15 minutes)

### 1. Stop Expo (Ctrl+C). Keep the backend running.

### 2. Get the new files into Ubuntu
Download `gharkhoji-redesign.zip` and save it to your Desktop. **Don't extract it in Windows.** Then:
```bash
cd /tmp && rm -rf gk-new && mkdir gk-new && cd gk-new
unzip -q /mnt/c/Users/User/OneDrive/Desktop/gharkhoji-redesign.zip
ls gharkhoji
```
(If it saved to Downloads, use `/mnt/c/Users/User/Downloads/gharkhoji-redesign.zip`.)

### 3. Replace the app code completely
Many screens were renamed or removed, and copying over the old folder would leave old screens behind. So **replace** `src` and `assets`:
```bash
cd ~/projects/gharkhoji
rm -rf mobile/src mobile/assets
cp -r /tmp/gk-new/gharkhoji/. ~/projects/gharkhoji/
ls mobile/src/app mobile/src/app/auth
```
You should see `auth  (tabs)  listing  _layout.tsx  index.tsx  post.tsx  search.tsx  welcome.tsx`, and in `auth`: `phone.tsx  profile.tsx  role.tsx  verify.tsx`.

Your `.env` files are not in the zip, so they stay safe.

### 4. Backend: new table and nicer test photos
```bash
cd ~/projects/gharkhoji
docker compose restart api worker
docker compose logs api | grep "0003 -> 0004"
docker compose exec api python -m scripts.seed --reset
docker compose exec api pytest -q
```
Expected: `Running upgrade 0003 -> 0004, saved rooms`, then `✅ Created 30 listings`, then **73 passed**.

### 5. App packages (icons, gradients, haptics, splash)
```bash
cd ~/projects/gharkhoji/mobile
npm install
npx expo start --tunnel --clear
```

### 6. See the full new experience from the start
The app remembers that you've already seen the welcome screen. To see the **brand-new onboarding**:
- **Profile → Log out**, then
- iPhone Settings → General → iPhone Storage → Expo Go → **Offload App**, or delete and reinstall Expo Go. This clears its saved data.

Then scan the QR code again. You'll get: splash → welcome slides → role → phone → code → name → app.

---

## Try these
1. On the welcome screen, switch **EN ↔ ने**. Everything changes language.
2. Choose **"I have a room to rent"** and sign up with a new number (e.g. `9812345678`). You land on **My listings** with the **＋** button in the tab bar.
3. Log out and sign up as a **room seeker**. The tab bar shows **Saved** instead. Tap ♥ on a few rooms, then open **Saved**.
4. **Search:** type "Koteshwor", open the **filter sheet**, choose 2BHK and up to Rs 20,000, then **Show results**.
5. Open a room: swipe the photos, tap **Share**, and scroll down to the cost card and the area map.
6. Enter a wrong OTP code and watch the boxes shake.

---

## Customise the look
| Want to change… | Edit |
|---|---|
| Brand colours (teal and coral) | `mobile/src/lib/theme.ts` → `colors.primary`, `colors.accent`, `gradients` |
| Text or translations | `mobile/src/i18n/en.json` and `ne.json` |
| Home screen sections | `mobile/src/app/(tabs)/index.tsx` |
| Logo and icons | `mobile/assets/*.png` and `mobile/src/assets/logo-*.png` |
| Splash background | `mobile/app.json` → `expo-splash-screen` → `backgroundColor` |

The splash screen and app icon only change in a **real build** (EAS Build, Day 5). Expo Go always shows its own icon.

---

## If something goes wrong
| Problem | Fix |
|---|---|
| Red screen: "Unable to resolve module …/login" or a duplicate route | Old files were left behind. Repeat step 3 exactly (`rm -rf mobile/src mobile/assets` first) |
| Icons show as squares or question marks | Stop Expo and run `npx expo start --tunnel --clear` |
| ♥ does nothing | Log in first (it opens the login screen for guests). Check that the backend ran migration `0004` |
| Explore rows are empty | Run `docker compose exec api python -m scripts.seed --reset` and pull down to refresh |
| Still see the old design | You're on an old bundle. Shake the phone → **Reload**, or restart Expo with `--clear` |
