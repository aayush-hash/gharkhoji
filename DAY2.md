# GharKhoji — Day 2 Guide: Listings, Photos, Search

Goal: create a listing with photos in `/docs` and find it with a radius search.

The Day 2 code is written and tested (55 tests passing). Today you install it, try every feature, and learn how it works.

---

## PART A — Update your project (≈ 15 minutes)

### Step 1. Stop the server
In the terminal running `docker compose up`, press **Ctrl+C**.

### Step 2. Copy the new code over the old
The new zip has all Day 1 files plus Day 2, including your docker-compose fix. **Your `.env` is not in the zip, so it stays safe.**

1. Download **gharkhoji-day2.zip** (it may go to your OneDrive Desktop or Downloads).
2. In Ubuntu (change the path if you saved it somewhere else):
   ```bash
   cd ~/projects
   cp /mnt/c/Users/User/OneDrive/Desktop/gharkhoji-day2.zip .
   unzip -o gharkhoji-day2.zip
   cd gharkhoji
   ls
   ```
   `-o` means "overwrite without asking". You should now also see `DAY2.md`.
3. Make sure your secret key is still there:
   ```bash
   grep SECRET_KEY backend/.env
   ```

### Step 3. Add the new settings to your `.env`
Open `backend/.env` in VS Code and add these lines at the end, then save:
```
PUBLIC_BASE_URL=http://localhost:8000
STORAGE_BACKEND=local
```

### Step 4. Rebuild and start
New Python packages were added (`geoalchemy2` for maps, `boto3` for cloud storage), so use `--build`:
```bash
docker compose up --build
```
Wait for these lines:
```
Running upgrade 0001 -> 0002, listings and photos
Application startup complete.
```

### Step 5. Add 30 test listings
In a **second Ubuntu terminal**:
```bash
cd ~/projects/gharkhoji
docker compose exec api python -m scripts.seed
```
This creates 30 listings around Kathmandu, each with 1–3 placeholder photos, owned by 3 test accounts:

| Phone | Name | Role |
|---|---|---|
| 9800000001 | Ram Shrestha | owner |
| 9800000002 | Sita Maharjan | owner |
| 9800000003 | Hari Tamang | agent |

You can log in as any of them. The OTP still prints in the first terminal.

### Step 6. Run the tests
```bash
docker compose exec api pytest -q
```
Expected: **55 passed**.

---

## PART B — Try it in /docs (≈ 1 hour)

Open http://localhost:8000/docs. There are three new sections: **listings**, **photos** and **search**.

### Search first (no login needed)
1. **GET /api/v1/search/places**: try `q` = `baneshwor`, then `q` = `ठमेल`. These are the areas and landmarks for the app's home screen.
2. **GET /api/v1/search/listings**:
   - `place` = `koteshwor`, `radius_km` = `2`. You get listings within 2 km, with `distance_m` on each.
   - Add `max_rent` = `15000`. Only cheaper ones remain.
   - Set `sort` = `distance`. Nearest first.
   - Click **Add string item** under `type` and pick `room` and `1bhk`.
   - Under `amenity`, add `water_24h`. Only listings with 24-hour water.
3. Copy a `cover_photo_url` from the results and open it in your browser. You'll see a placeholder photo.

### Create your own listing (the "Done when" test)
1. **Log in as Ram:** request an OTP for `9800000001`, verify it with the code from the terminal, then click **Authorize** and paste the `access_token`. (Same steps as Day 1.)
2. **POST /api/v1/listings**: use this body:
   ```json
   {
     "listing_type": "1bhk",
     "title": "Sunny 1BHK near Tinkune",
     "rent": 15000,
     "deposit": 30000,
     "water_charge": 500,
     "waste_charge": 200,
     "internet_charge": 800,
     "parking_charge": 0,
     "amenities": ["water_24h", "bike_parking", "attached_bathroom"],
     "area": "Tinkune",
     "landmark": "Behind Tinkune Chowk",
     "lat": 27.6858,
     "lng": 85.3470
   }
   ```
   Look at the response:
   - `status` is `draft`, so it's not public yet.
   - `cost.total_monthly` is 16,500. That's the "what will I actually pay" number.
   - `exact_location` is what you sent, but `approx_location` is shifted 150–300 m. The public only sees the approximate one, so nobody can find the exact house from the app.

   **Copy the `id`.**
3. **Upload a photo:** this takes 3 steps, just like the phone app will do it.

   **3a. Get an upload URL.** Use **POST /listings/{listing_id}/photos/upload-url** with the id you copied and this body:
   ```json
   {"content_type": "image/jpeg", "size_bytes": 200000}
   ```
   Copy the `upload_url` and the `photo_id`.

   **3b. Upload the file.** /docs can't send raw files, so use the terminal. Put any JPG photo from your phone or laptop on your Desktop, name it `room.jpg`, then run (keep the quotes around the URL):
   ```bash
   curl -X PUT "PASTE_UPLOAD_URL_HERE" \
     -H "Content-Type: image/jpeg" \
     --data-binary @/mnt/c/Users/User/OneDrive/Desktop/room.jpg \
     -w "%{http_code}\n"
   ```
   It should print `204`.

   **3c. Confirm the upload.** Use **POST /listings/{listing_id}/photos/{photo_id}/complete**. The response now shows your photo in `photos`.
4. **POST /listings/{listing_id}/publish**. The `status` becomes `active`.
5. **Find it:** **GET /search/listings** with `lat` = `27.6915`, `lng` = `85.3420` (New Baneshwor), `radius_km` = `2`, `q` = `Tinkune`. Your listing appears, about 800 m away. ✅ **That's today's goal.**

### Try to break it (each of these should be refused)
- Log in as a **tenant** (any new number, set `"role": "tenant"`) and try to create a listing → **403**
- Log in as **Hari (agent)** and create a listing without `agent_commission` → **422** ("Agents must state their commission")
- Log in as **Sita** and try to edit Ram's listing → **403**
- Publish a listing that has no photos → **422**
- Upload a `.txt` file renamed to `.jpg` → **400** (the server checks the real file contents, not the name)
- Create a listing with `lat: 28.2, lng: 83.98` (Pokhara) → **422** (it must be in Kathmandu Valley)
- **POST /mark-rented** on your listing, then search again → it disappears from search

---

## PART C — How it works (≈ 2 hours, don't skip)

Same four-file pattern as Day 1, in three new modules:

| Module | What it does |
|---|---|
| `app/modules/listings/` | The listing table, validation, create/edit/publish/rented/delete, who is allowed to do what |
| `app/modules/media/` | Photo records and the 3-step upload flow |
| `app/modules/search/` | Filters, radius search, sorting, and the Kathmandu places list |
| `app/core/storage.py` | Where photo files actually go (local disk now, Cloudflare R2 later) |

### Read these files in order
1. **`listings/models.py`**: the `listings` table. Notes:
   - Money is stored as whole rupees (`Integer`). Never use floats for money.
   - `amenities` is a Postgres **array** column, so one listing can hold many amenities.
   - `location` is a **PostGIS geography point**. That's what makes "within 2 km" fast and accurate.
   - `CheckConstraint("rent > 0")`: the database itself refuses bad data, even if the code has a bug.
2. **`listings/schemas.py`**: all input validation (rent limits, the valley bounding box, known amenities).
3. **`listings/service.py`**: the rules. Look at `jitter()` (location privacy), `_check_commission()` (agents must show their commission) and `publish()` (needs a photo).
4. **`core/storage.py`**, then **`media/service.py`** and **`media/router.py`**: the upload flow.
5. **`search/service.py`**: how filters become SQL. `ST_DWithin` = "within X metres".
6. **`alembic/versions/..._0002_...py`**: the migration. The comments show the 2 bugs I fixed in the autogenerated draft.
7. **`tests/test_listings.py`**: every rule above, written as a test.

### Listing life cycle
```
draft ──publish──▶ active ──mark-rented──▶ rented ──publish──▶ active
                     │  ▲
      (Day 4: no     │  │ confirm-available
       reply 72h)    ▼  │
                   expired
any status ──delete──▶ removed   (soft delete: row kept for reports/moderation)
```

### Why photos upload in 3 steps
In production, the phone uploads photos **directly to Cloudflare R2**, not through your server. This saves server bandwidth and keeps big uploads from slowing down the API. The API only hands out a short-lived signed link (step 1) and checks the result (step 3). In development, the "link" points back to your own API instead. The app code is identical in both cases, so on Day 5 you only change `STORAGE_BACKEND=s3` in `.env`.

### Why MinIO was replaced
MinIO stopped publishing free Docker images (that's why your first `docker compose up` failed). Local disk works for development, and production uses Cloudflare R2, which is S3-compatible and has no charge for downloads. Nothing to install today.

### Useful commands
```bash
docker compose exec api python -m scripts.seed --reset          # recreate the 30 test listings
docker compose exec db psql -U postgres -d gharkhoji             # open the database, then try:
    SELECT title, rent, area, status FROM listings LIMIT 10;
    SELECT count(*) FROM listings WHERE status = 'active';
    \q
ls backend/media_uploads/listings/                                # uploaded photo files
```

---

## PART D — Save to GitHub
```bash
cd ~/projects/gharkhoji
git status                 # backend/.env and backend/media_uploads must NOT be listed
git add .
git commit -m "Day 2: listings, photo uploads, PostGIS radius search, seed data"
git push
```

## ✅ Day 2 is done when
- [ ] `docker compose up --build` ran migration `0002`
- [ ] The seed script created 30 listings
- [ ] `pytest` shows **55 passed**
- [ ] You created a listing, uploaded a real photo with curl, published it, and found it with a radius search
- [ ] You tried at least 3 of the "break it" checks
- [ ] Pushed to GitHub

## If something goes wrong
| Problem | Fix |
|---|---|
| `ModuleNotFoundError: geoalchemy2` | You forgot `--build`. Run `docker compose up --build` |
| curl upload returns `403` | The upload link expired (10 minutes) or was pasted incompletely. Get a new one (step 3a) and keep the quotes around the URL |
| curl upload returns `400` | The `Content-Type` in curl doesn't match the file, e.g. a `.png` sent as `image/jpeg` |
| `curl: (26) Failed to open/read local data` | Wrong file path. Check with `ls /mnt/c/Users/User/OneDrive/Desktop/` |
| Complete returns `409 Upload not found` | Step 3b didn't return 204. Do the upload again |
| `Permission denied: 'media_uploads'` | Run `mkdir -p backend/media_uploads && chmod 777 backend/media_uploads` and restart |
| Seed says "already exists" | That's fine. Use `--reset` to recreate |
