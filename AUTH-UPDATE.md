# GharKhoji: Password Login and a Secured Database

## What changed

### Log in once with a code, then always with a password
| | Before | Now |
|---|---|---|
| **Create account** (once) | Phone → SMS code → name | Role → phone → **SMS code** → name + **password** |
| **Log in** (every time) | Phone → SMS code, every time | Phone + **password**. No code, no waiting for an SMS |
| **Forgot password** | n/a | Phone → **SMS code** → new password → logged in |
| **Change password** | n/a | Profile → Change password (needs the current one) |

The app also:
- **Pre-fills your number** on the login screen.
- Works with **iPhone Keychain**: it offers to save the password and can suggest a strong one.
- Has a **show/hide eye** on password fields.
- Shows a **live strength checklist** while you create a password.
- If you try to sign up with a number that already has an account, it says **"Log in instead"**. If you try to reset a password for a number with no account, it says **"Create an account"**.

### Security built in
- **Passwords are hashed with Argon2id**, the method OWASP recommends first. The real password is never stored or logged, so even someone with the database can't read it.
- **Brute-force lock:** 5 wrong passwords lock that number for 15 minutes. Resetting the password by SMS unlocks it. One network is limited to 50 failed logins per hour.
- **No account fishing:** a wrong number and a wrong password take the same time and show the same message. Attackers can't use the login screen to find out who has an account.
- **Weak passwords are refused**, on the phone and again on the server: at least 8 characters, letters and numbers, and no common passwords like `password123`.
- **Resetting or changing a password logs out every other phone instantly.** Their old tokens stop working at once.
- **SMS codes** are single-use and tied to their purpose (a sign-up code can't reset a password). Each successful code gives a one-time ticket that expires after 15 minutes.

### Database and Redis locked down
| | Before | Now |
|---|---|---|
| Postgres login | `postgres` / `postgres` (the superuser) | App user **`gharkhoji_app`** with a **random 48-character password**. It isn't a superuser and can't create users or databases |
| Postgres port | Reachable from your Wi-Fi network | **Only from this computer** (127.0.0.1) |
| Redis | No password, open port | **Password required**, **no port open** outside Docker |
| Password check | Default | SCRAM-SHA-256 (passwords are never sent in plain text) |
| Other database users | Could connect | Blocked (`REVOKE ALL … FROM PUBLIC`) |

The passwords live in a new `.env` file next to `docker-compose.yml`. It's created by a script and is never committed to Git or included in the zip.

---

## Install (≈ 10 minutes)

> ⚠️ **This resets your development database.** The new secure database user can only be created on a fresh database. The seed script recreates the 30 test rooms, but the rooms you posted by hand and your test accounts will be gone. This is only local test data.

### 1. Stop everything and delete the old, unsecured database
```bash
cd ~/projects/gharkhoji
docker compose down -v
rm -rf backend/media_uploads backend/scripts/init-test-db.sql
```

### 2. Copy in the new files
Save `gharkhoji-auth.zip` to your Desktop, then:
```bash
cd /tmp && rm -rf gk-new && mkdir gk-new && cd gk-new
unzip -q /mnt/c/Users/User/OneDrive/Desktop/gharkhoji-auth.zip
cd ~/projects/gharkhoji
rm -rf mobile/src
cp -r /tmp/gk-new/gharkhoji/. ~/projects/gharkhoji/
chmod +x scripts/generate-secrets.sh backend/scripts/db-init.sh
```

### 3. Create the passwords (once)
```bash
./scripts/generate-secrets.sh
```
You should see `✅ Created .env with random passwords for Postgres and Redis.` You never have to type these passwords yourself.

### 4. Start and check
The `--build` flag is needed because a new Python package, `argon2-cffi`, is being added.
```bash
docker compose up -d --build
docker compose logs db | grep GharKhoji
docker compose logs api | grep "0004 -> 0005"
docker compose exec api python -m scripts.seed
docker compose exec api pytest -q
```
Expected:
- `GharKhoji: created database user 'gharkhoji_app' and test database`
- `Running upgrade 0004 -> 0005, user passwords`
- `✅ Created 30 listings. Test accounts (password: gharkhoji123)`
- **97 passed**

### 5. Watch the logs, then start the app
Tab 1:
```bash
docker compose logs -f api worker
```
Tab 2:
```bash
cd ~/projects/gharkhoji/mobile
npx expo start --tunnel --clear
```
There are no new npm packages this time.

If you were logged in before, the app logs you out once. Old accounts have no password yet, so use **Create an account** or **Forgot password**.

---

## Try it on your iPhone
1. **Log in with a test account:** `9800000001`, password `gharkhoji123`. You go straight into My listings, with no code.
2. **Wrong password:** log out, then try `wrongpass1` a few times. From 2 attempts left, the app warns you. The 5th wrong try locks the number for 15 minutes.
3. **Create your own account:** Welcome → Get started → *I have a room to rent* → your number → code (it appears in Tab 1) → name + password. Watch the strength bar fill up.
4. **Log out and back in** with your number and password. No SMS this time.
5. **Forgot password:** Login → *Forgot password?* → code → new password. You're logged straight in.
6. **Change password:** Profile → *Change password*.
7. **Proof the database is locked:**
   ```bash
   docker compose exec redis redis-cli ping
   ```
   → `NOAUTH Authentication required`
   ```bash
   docker compose exec db psql -U postgres -d gharkhoji -c "select phone, left(password_hash, 30) from users;"
   ```
   → only `$argon2id$…` hashes. Nobody can read the real passwords.

---

## New API endpoints
| Endpoint | Body | Purpose |
|---|---|---|
| `POST /auth/otp/request` | `{phone, purpose: "signup" \| "reset"}` | Text a code |
| `POST /auth/otp/verify` | `{phone, purpose, code}` | Returns a `verification_token` |
| `POST /auth/register` | `{verification_token, full_name, role, password}` | Create the account and log in |
| `POST /auth/login` | `{phone, password}` | Log in |
| `POST /auth/password/reset` | `{verification_token, password}` | Forgot password; logs out other devices |
| `POST /auth/password/change` | `{current_password, password}` (logged in) | Change password; logs out other devices |

## If something goes wrong
| Problem | Fix |
|---|---|
| `required variable APP_DB_PASSWORD is missing` | Run `./scripts/generate-secrets.sh` |
| `password authentication failed for user "gharkhoji_app"` | The old database volume is still there. Run `docker compose down -v`, then `docker compose up -d --build` |
| `Permission denied: ./scripts/generate-secrets.sh` | Run `chmod +x scripts/generate-secrets.sh backend/scripts/db-init.sh` |
| `ModuleNotFoundError: argon2` | You skipped `--build`. Run `docker compose up -d --build` |
| App says "This account doesn't have a password yet" | It's an old account. Tap **Set a password with an SMS code** |
| "Too many wrong passwords" | Wait 15 minutes, or use **Forgot password** to unlock now |
| Red screen: "Unable to resolve …/auth/…" | Old screens were left behind. Repeat step 2 exactly (`rm -rf mobile/src` first) |

**Never share or commit the `.env` files.** If one ever leaks, tell me and we will rotate the passwords.
