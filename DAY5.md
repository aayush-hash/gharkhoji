# GharKhoji Day 5: Production-Ready

Four things were added: reports and moderation, an admin panel, real SMS, and security hardening with automatic backups.

**Checked:**
- 158 backend tests pass (35 are new).
- The database migration was tested up and down as the restricted database user.
- The iOS and Android bundles build.
- The whole flow was tested in a browser: report a room → the admin removes it → the room disappears for users.

---

## 1. Reports and moderation
- **"Report this room"** at the bottom of every room page. The reasons are:
  - Fake photos or details
  - Already rented
  - Wrong price
  - Asks for money before a visit
  - Agent pretending to be the owner
  - Offensive content
  - Something else
- Reports are **private**: the owner never sees who reported them.
- **Anti-abuse:**
  - One open report per person per room.
  - At most 10 reports per person per day.
  - You can't report your own room.
- When a room reaches **3 reports**, every admin gets a push notification.
- Chat reports (from the chat update) go into the **same queue**.
- If a room is removed or rented, the page now says **"This room isn't available"** with a "Find other rooms" button, instead of an error.

## 2. Admin panel: `http://192.168.1.70:8000/admin`
A web page served by your backend, so there's nothing extra to install. Log in with an **admin** account's phone and password.

| Page | What you can do |
|---|---|
| **Overview** | Open reports, live listings, users, new users, chat messages, suspended accounts |
| **Reports** | Most-reported rooms first. For each report you see who reported, who posted it, the reason, and the last chat messages for chat reports. Then **Dismiss**, **Remove room**, or **Suspend person** |
| **Listings** | Search every room, filter by status, **Remove** or **Restore** |
| **Users** | Search by name or phone, see reports against each person, **Suspend** or **Unsuspend** |
| **Activity log** | Every moderator action: who did it, when, and why. It can't be edited |

**What happens when you...**
- **Remove a room:** it disappears from search and from the owner's list. The owner gets a notification with your reason. The owner can't bring it back, but you can restore it.
- **Suspend a person:** they're logged out on every phone at once, can't log in ("This account is suspended"), and all their rooms are hidden. Unsuspending brings everything back.
- Admins can't be suspended, and you can't suspend yourself.

It works on a phone browser too. Admins also get an **Admin panel** item in the app's Profile tab.

**Security of the panel:** a strict Content-Security-Policy (it can only run its own code), no framing, hidden from search engines, and every action is checked on the server.

## 3. Real SMS (Sparrow SMS or Aakash SMS)
Choose the provider in `backend/.env`:
```
SMS_PROVIDER=console          # development: codes show in the logs (as now)
SMS_PROVIDER=sparrow          # + SPARROW_TOKEN=…  SPARROW_FROM=GharKhoji
SMS_PROVIDER=aakash           # + AAKASH_TOKEN=…
```
- If the gateway fails, the user sees "We couldn't send the SMS right now. Please try again in a minute" and can retry **immediately**. The 60-second wait doesn't apply to an SMS that never arrived.
- The message text, full phone number and token are **never written to logs**. Logs show a masked number like `981****678`.
- The server **refuses to start in production** with `console`, or when a provider's token is missing.

To get an account:
- **Sparrow SMS:** register at sparrowsms.com, buy credit, and request a sender identity such as "GharKhoji" (approval can take a few days). Copy the **token** from the dashboard.
- **Aakash SMS:** register at aakashsms.com, buy credit, and copy the **auth token**.

## 4. Security hardening and backups
- **Request limits on every API:** 240 requests per minute per logged-in user, and 600 per minute per network (set high because many phones in Nepal share one mobile IP). Going over returns "Too many requests" with a wait time. These are on top of the stricter limits for login, SMS codes, chat and reports.
- **Size limits:** JSON requests are limited to 1 MB and photos to 10 MB. Anything bigger is refused before it reaches the app.
- **Security headers** on every response: no sniffing, no framing, no referrer, a locked-down Content-Security-Policy, and HSTS in production.
- **CORS:** only the listed web domains, with no cookies (the app uses tokens).
- **The server name is hidden** from responses.
- **Production safety checks:** the API **won't start** in production if any of these is unsafe:
  - the secret key
  - the database password
  - the Redis password
  - the SMS provider
  - CORS set to `*`
  - allowed hosts
  - PUBLIC_BASE_URL not using https
- **Automatic database backups** (a new `backup` service):
  - A backup is taken when it starts, then **every 24 hours**. The last **14 days** are kept.
  - Every backup is **checked after writing**; a broken file is deleted, never kept.
  - The files are in `backups/` next to `docker-compose.yml` and readable only by you. They're **excluded from Git**, because they contain personal data.
  - Restoring was tested, including restoring over existing data.

---

## Install (about 10 minutes)

### 1. Stop Expo (Ctrl+C). Keep Docker running.

### 2. Copy the files in
Save `gharkhoji-day5.zip` to your Desktop, then in Ubuntu:
```bash
cd /tmp && rm -rf gk-d5 && mkdir gk-d5 && cd gk-d5
unzip -q /mnt/c/Users/User/OneDrive/Desktop/gharkhoji-day5.zip
cp -r /tmp/gk-d5/gharkhoji-day5/. ~/projects/gharkhoji/
cd ~/projects/gharkhoji
chmod +x backend/scripts/backup.sh backend/scripts/restore.sh
```
This adds or replaces only the 33 files listed at the end of this guide. Your `.env` files are not touched.

### 3. Start the new pieces
```bash
docker compose up -d --build
docker compose logs api | grep "0006 -> 0007"
docker compose logs backup
docker compose exec api pytest -q
```
Expected:
- `Running upgrade 0006 -> 0007, reports and moderation`
- `✅ backup /backups/gharkhoji-….dump`
- **158 passed**

### 4. Make yourself an admin
Use the number of the account you created in the app:
```bash
docker compose exec api python -m scripts.make_admin 98XXXXXXXX
```
Then open **http://192.168.1.70:8000/admin** in your laptop browser (or `http://localhost:8000/admin`) and log in with that number and your password.

### 5. Start the app
```bash
cd ~/projects/gharkhoji/mobile
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.70 npx expo start --lan --clear
```
There are no new npm packages.

---

## Try it
1. On the phone, log in as `9800000003` / `gharkhoji123`. Open a room, scroll down, tap **Report this room** → **Asks for money before a visit** → **Send report**.
2. In the admin panel, **Reports** shows it. Click **Remove room** and write a reason.
3. On the phone, open that room again: "This room isn't available". It's gone from search too.
4. In the admin panel, go to **Listings**, filter by **removed**, and click **Restore**. The room is back.
5. In **Users**, suspend `9800000003`. The phone is logged out and can't log in. Unsuspend them afterwards.
6. Check **Activity log**: every step is recorded.

## Backups: everyday commands
```bash
ls -lh backups/                        # see backups
docker compose restart backup          # take a backup right now
docker compose exec backup bash /restore.sh gharkhoji-20260925-101218.dump
docker compose restart api worker      # after a restore
```
The restore command asks you to type `RESTORE` first, because it replaces the current data.

⚠️ Backups on the same computer don't protect you if the laptop or server dies. When we go live, we'll also copy them off the server, to Cloudflare R2.

## If something goes wrong
| Problem | Fix |
|---|---|
| `relation "listing_reports" does not exist` | The migration didn't run. Run `docker compose restart api` and check step 3 |
| The admin page says "This account is not an admin" | Run step 4 with the number you log in with |
| `Permission denied: /backup.sh` | Run `chmod +x backend/scripts/backup.sh backend/scripts/restore.sh`, then `docker compose up -d` |
| "Too many requests" while testing | Wait one minute. It's the new rate limit working |
| The SMS provider won't start | Check the token in `backend/.env`. The error says exactly what's missing |

## Files in this update
**New (15):**
- `backend/app/core/sms.py`
- `backend/app/core/protection.py`
- `backend/app/modules/moderation/`:
  - `__init__.py`
  - `models.py`
  - `schemas.py`
  - `service.py`
  - `router.py`
  - `admin_page.py`
  - `admin_static/index.html`
  - `admin_static/app.js`
  - `admin_static/app.css`
- `backend/alembic/versions/20260925_0007_reports_and_moderation.py`
- `backend/scripts/backup.sh`
- `backend/scripts/restore.sh`
- `mobile/src/components/ReportSheet.tsx`

**New tests (3):**
- `backend/tests/test_moderation.py`
- `backend/tests/test_sms.py`
- `backend/tests/test_protection.py`

**Updated (15):**
- `backend/app/`:
  - `main.py`
  - `models.py`
  - `core/config.py`
  - `modules/auth/service.py`
  - `modules/listings/models.py`
  - `modules/listings/service.py`
  - `modules/search/service.py`
- `backend/Dockerfile`
- `backend/.env.example`
- `docker-compose.yml`
- `.gitignore`
- `mobile/src/app/listing/[id]/index.tsx`
- `mobile/src/app/(tabs)/profile.tsx`
- `mobile/src/i18n/en.json`
- `mobile/src/i18n/ne.json`
