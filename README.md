# GharKhoji — Day 1 Guide

Goal for today: one command starts the whole backend (API + Postgres/PostGIS + Redis + MinIO), and you can log in with a phone number through `http://localhost:8000/docs`.

The backend code for Day 1 is already written and tested (24 tests passing). Your job today is to set up your laptop, run it, understand every file, and push it to GitHub.

---

## PART A — Set up your Windows laptop (≈ 1–2 hours)

### Step 1. Install WSL2 (Ubuntu)
WSL2 gives you a real Linux inside Windows. Backend work is much smoother there.

1. Open **PowerShell as Administrator** (right-click Start → Terminal (Admin)).
2. Run:
   ```powershell
   wsl --install -d Ubuntu-24.04
   `
3. **Restart** your laptop.
4. Ubuntu opens by itself and asks for a **username and password** (for Linux only; the password won't show while typing — that's normal).
5. Update Ubuntu:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

> From now on, **"Ubuntu terminal"** means: Start menu → Ubuntu (or `wsl` in PowerShell).

### Step 2. Install Docker Desktop
1. Download from https://www.docker.com/products/docker-desktop/ and install.
2. During install, keep **"Use WSL 2 instead of Hyper-V"** ticked.
3. Open Docker Desktop → **Settings → Resources → WSL Integration** → turn on **Ubuntu-24.04** → Apply & Restart.
4. Check in the Ubuntu terminal:
   ```bash
   docker --version
   docker compose version
   docker run hello-world
   ```
   If `hello-world` prints "Hello from Docker!", you're good.

### Step 3. Install Git and set your identity (inside Ubuntu)
```bash
sudo apt install -y git
git config --global user.name "Aayush"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
git config --global core.autocrlf input
```

### Step 4. Install Node LTS (inside Ubuntu) — needed on Day 3 for Expo
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install --lts
node -v && npm -v
```

### Step 5. Install Python 3.12 (inside Ubuntu)
Ubuntu 24.04 ships with Python 3.12 already:
```bash
python3 --version
sudo apt install -y python3-venv python3-pip
```

### Step 6. Install VS Code + extensions (on Windows)
1. Install VS Code from https://code.visualstudio.com
2. Extensions: **WSL**, **Python**, **Ruff**, **Docker**, **ES7+ React/Redux/React-Native snippets**.
3. To open a project from Ubuntu, `cd` into it and run `code .` — VS Code opens connected to WSL.

### Step 7. On your iPhone
Install **Expo Go** from the App Store now. You'll use it on Day 3.

---

## PART B — Get the project running (≈ 1 hour)

### Step 8. Put the project in your Linux home folder
⚠️ Keep the project **inside Ubuntu** (`~/projects/...`), **not** in `C:\Users\...`. Files on the Windows drive are 5–10× slower in Docker and break live reload.

Copy the zip from Windows Downloads into Ubuntu and unzip it (replace `YourWindowsName`):
```bash
mkdir -p ~/projects && cd ~/projects
cp /mnt/c/Users/YourWindowsName/Downloads/gharkhoji-day1.zip .
sudo apt install -y unzip
unzip gharkhoji-day1.zip
cd gharkhoji
code .
```

### Step 9. Create your .env file with a real secret
```bash
cd backend
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```
Open `backend/.env` in VS Code and paste the printed value after `SECRET_KEY=`.

### Step 10. Start everything
```bash
cd ~/projects/gharkhoji
docker compose up --build
```
The first run downloads images (a few minutes). Keep this terminal open — the API logs appear here.

You should see `Running upgrade -> 0001` (the migration) and `Uvicorn running on http://0.0.0.0:8000`.

### Step 11. Check it works
Open in your Windows browser:
- http://localhost:8000/health → `{"status":"ok","database":"ok","redis":"ok"}`
- http://localhost:8000/docs → interactive API page
- http://localhost:9001 → MinIO console (login `minioadmin` / `minioadmin`), you should see 2 buckets

### Step 12. Log in with a phone number (in /docs)
1. `POST /api/v1/auth/otp/request` → **Try it out** → body `{"phone": "9812345678"}` → Execute.
2. Look at the `docker compose` terminal. You'll see:
   `📱 SMS to +9779812345678: Your GharKhoji code is 482913 ...`
3. `POST /api/v1/auth/otp/verify` → `{"phone": "9812345678", "code": "482913"}` → you get `access_token`, `refresh_token`, and `is_new_user: true`.
4. Click the **Authorize** 🔒 button (top right), paste the `access_token`, Authorize.
5. `GET /api/v1/users/me` → your profile.
6. `PATCH /api/v1/users/me` → `{"full_name": "Aayush", "role": "owner", "language": "ne"}` → `onboarding_completed: true`.

Also try breaking it: wrong code 5 times, requesting a code twice within 60 seconds, the phone `12345`, and `"role": "admin"`. Each should be refused.

### Step 13. Run the tests
Open a second Ubuntu terminal:
```bash
cd ~/projects/gharkhoji
docker compose exec api pytest -q
docker compose exec api ruff check .
```
Expected: `24 passed` and `All checks passed!`

> If tests fail with "database gharkhoji_test does not exist", your Postgres volume was created before the init script existed. Reset it once: `docker compose down -v` then `docker compose up --build`.

### Step 14. Make yourself an admin (for the admin panel on Day 5)
```bash
docker compose exec api python -m scripts.make_admin 98XXXXXXXX
```

---

## PART C — Understand what you're running (≈ 2–3 hours, don't skip)

Read the files in this order. Each one is short.

| # | File | What it does |
|---|---|---|
| 1 | `docker-compose.yml` | The 5 services and how they connect. Note: inside Docker the database host is `db`, not `localhost`. |
| 2 | `backend/app/core/config.py` | All settings come from environment variables. Nothing secret is hard-coded. |
| 3 | `backend/app/core/database.py` | Async DB engine, `Base` class, `id` and timestamp columns every table reuses. |
| 4 | `backend/app/modules/users/models.py` | The `users` table: phone, role (tenant/owner/agent/admin), language (en/ne). |
| 5 | `backend/alembic/versions/..._0001_...py` | The migration that creates the tables and enables PostGIS. |
| 6 | `backend/app/core/security.py` | JWT tokens and OTP hashing. The raw OTP is never stored. |
| 7 | `backend/app/modules/auth/service.py` | The heart of Day 1: OTP rules, rate limits, token rotation. |
| 8 | `backend/app/modules/auth/router.py` | Turns the service into HTTP endpoints. |
| 9 | `backend/app/core/deps.py` | `CurrentUser` and `require_roles(...)` — how endpoints know who is calling. |
| 10 | `backend/tests/` | Each test is a small story of how the API should behave. |

### How the pattern works (you'll copy this for every new module)
Every module has the same four files:
- **models.py** — database tables (SQLAlchemy)
- **schemas.py** — what the API accepts and returns (Pydantic). Validation happens here.
- **service.py** — the business rules. No HTTP code here.
- **router.py** — thin HTTP layer that calls the service.

Then register the models in `app/models.py` and the router in `app/main.py`.

### Security decisions built into Day 1
- OTP: 6 digits, expires in 5 minutes, single-use, max 5 wrong tries, 60-second resend cooldown, max 5 codes per number per hour and 20 per IP per hour.
- OTP is stored only as an HMAC hash in Redis.
- Access token lives 15 minutes; refresh token 30 days.
- Refresh tokens **rotate**: each works once. Reusing an old one (a sign it was stolen) logs out all of that user's sessions.
- Users can pick tenant/owner/agent once during onboarding; they can never make themselves admin. Changing role later will go through verification (brokers can't switch to "owner").
- `/docs` is hidden in production; SMS printing refuses to run in production.

### How to add a table later (Day 2 onward)
1. Add/change a model in `models.py` and import it in `app/models.py`.
2. Generate a migration: `docker compose exec api alembic revision --autogenerate -m "add listings"`
3. **Open the generated file and review it** (autogenerate is not always perfect).
4. Apply it: `docker compose exec api alembic upgrade head`

---

## PART D — Push to GitHub (≈ 20 minutes)

### Step 15. Connect Ubuntu to GitHub with an SSH key
```bash
ssh-keygen -t ed25519 -C "you@example.com"     # press Enter 3 times
cat ~/.ssh/id_ed25519.pub
```
Copy the output → GitHub → Settings → SSH and GPG keys → New SSH key → paste.
```bash
ssh -T git@github.com     # type "yes"; should greet you by username
```

### Step 16. Create the repo and push
On GitHub, create a **private** repo named `gharkhoji` (no README, no .gitignore). Then:
```bash
cd ~/projects/gharkhoji
git init
git add .
git status        # make sure backend/.env is NOT in the list
git commit -m "Day 1: backend foundation, phone OTP auth, users"
git remote add origin git@github.com:YOUR_USERNAME/gharkhoji.git
git push -u origin main
```

---

## ✅ Day 1 is done when
- [ ] `docker compose up --build` starts all services without errors
- [ ] `/health` shows database and redis `ok`
- [ ] You logged in through `/docs` using the code printed in the terminal
- [ ] `PATCH /users/me` saved your name, role and language
- [ ] `pytest` shows 24 passed
- [ ] Code is on GitHub and `.env` is **not**

## Useful commands
```bash
docker compose up --build        # start (first time or after changing requirements.txt)
docker compose up -d             # start in background
docker compose logs -f api       # follow API logs (OTP codes appear here)
docker compose down              # stop
docker compose down -v           # stop AND delete database data (fresh start)
docker compose exec db psql -U postgres -d gharkhoji    # open the database; \dt lists tables
docker compose exec redis redis-cli keys 'otp:*'        # see OTP keys in Redis
```

## Common problems on Windows
| Problem | Fix |
|---|---|
| `docker: command not found` in Ubuntu | Docker Desktop → Settings → Resources → WSL Integration → enable Ubuntu |
| Port 5432 already in use | You have Postgres installed on Windows. Stop it (Services → postgresql → Stop) or change `"5432:5432"` to `"5433:5432"` |
| Live reload doesn't pick up changes | The project is on `C:\`. Move it to `~/projects` inside Ubuntu |
| `\r: command not found` / weird script errors | Windows line endings. The `.gitattributes` file prevents this; re-clone if it happened |
| Laptop very slow | Create `C:\Users\YourName\.wslconfig` with `[wsl2]` and `memory=4GB`, then `wsl --shutdown` in PowerShell |
