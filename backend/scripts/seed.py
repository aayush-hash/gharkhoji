"""Fill the database with ~30 fake Kathmandu listings for testing.

    docker compose exec api python -m scripts.seed           # add seed data (skips if already there)
    docker compose exec api python -m scripts.seed --reset   # delete seed data and create it again

Creates 3 test accounts. Log in with the phone number and password  gharkhoji123
    9800000001  Ram Shrestha   (owner)
    9800000002  Sita Maharjan  (owner)
    9800000003  Hari Tamang    (agent)
"""
import asyncio
import random
import struct
import sys
import zlib
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.core.storage import LocalStorage, build_photo_key, get_storage
from app.modules.listings.models import Amenity, Furnishing, Listing, ListingStatus, ListingType
from app.modules.listings.service import jitter, point_wkt
from app.modules.media.models import ListingPhoto, PhotoStatus
from app.modules.search.places import PLACES
from app.modules.users.models import User, UserRole

SEED_USERS = [
    ("+9779800000001", "Ram Shrestha", UserRole.OWNER),
    ("+9779800000002", "Sita Maharjan", UserRole.OWNER),
    ("+9779800000003", "Hari Tamang", UserRole.AGENT),
]
SEED_PASSWORD = "gharkhoji123"  # test accounts only — never use a shared password for real users

RENT_RANGE = {
    ListingType.ROOM: (5000, 10000),
    ListingType.ONE_BHK: (10000, 18000),
    ListingType.TWO_BHK: (18000, 30000),
    ListingType.THREE_BHK: (28000, 45000),
    ListingType.FLAT: (25000, 50000),
}
TITLES = {
    ListingType.ROOM: ["Single room near {p}", "Sunny room in {p}", "Room for students near {p}"],
    ListingType.ONE_BHK: ["1BHK with attached bathroom, {p}", "Cozy 1BHK near {p}", "1BHK on quiet lane, {p}"],
    ListingType.TWO_BHK: ["2BHK for small family, {p}", "Spacious 2BHK in {p}", "2BHK with balcony, {p}"],
    ListingType.THREE_BHK: ["3BHK family flat, {p}", "Big 3BHK with parking, {p}"],
    ListingType.FLAT: ["Full flat with terrace, {p}", "Independent flat near {p}"],
}
WALLS = [(236, 226, 208), (214, 228, 222), (226, 222, 238), (240, 232, 214), (222, 232, 240), (238, 220, 214)]
FLOORS = [(168, 124, 86), (140, 110, 84), (190, 160, 120), (120, 104, 96), (176, 140, 104)]
BEDS = [(64, 112, 160), (170, 80, 70), (80, 130, 110), (120, 90, 150), (200, 150, 60)]


def placeholder_png(seed: int, width: int = 480, height: int = 320) -> bytes:
    """A simple illustrated room (wall, window with sky, floor, bed, door) — no image library needed."""
    rnd = random.Random(seed)
    wall, floor, bed = rnd.choice(WALLS), rnd.choice(FLOORS), rnd.choice(BEDS)
    floor_y = int(height * 0.68)
    win = (int(width * rnd.uniform(0.12, 0.45)), int(height * 0.14), 0, 0)
    win = (win[0], win[1], win[0] + int(width * 0.26), win[1] + int(height * 0.3))
    bed_box = (int(width * 0.08), floor_y - int(height * 0.12), int(width * 0.52), floor_y + int(height * 0.1))
    door = (int(width * 0.78), int(height * 0.24), int(width * 0.9), floor_y)
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            if y >= floor_y:  # floor with plank lines
                shade = 0.92 if (y - floor_y) % 18 == 0 else 1.0 - (y - floor_y) / height * 0.4
                c = tuple(int(v * shade) for v in floor)
            else:  # wall with a soft light gradient
                shade = 1.0 - (x / width) * 0.10 - (y / height) * 0.05
                c = tuple(min(255, int(v * shade)) for v in wall)
            if win[0] <= x <= win[2] and win[1] <= y <= win[3]:
                edge = x - win[0] < 6 or win[2] - x < 6 or y - win[1] < 6 or win[3] - y < 6
                mid = abs(x - (win[0] + win[2]) // 2) < 3 or abs(y - (win[1] + win[3]) // 2) < 3
                if edge or mid:
                    c = (250, 250, 250)
                else:
                    t = (y - win[1]) / max(1, win[3] - win[1])
                    c = (int(120 + 90 * t), int(180 + 50 * t), int(235 + 10 * t))  # sky
            if door[0] <= x <= door[2] and door[1] <= y <= door[3]:
                c = (150, 108, 72) if not (x - door[0] < 4 or door[2] - x < 4 or y - door[1] < 4) else (120, 84, 56)
                if abs(x - (door[2] - 12)) < 3 and abs(y - (door[1] + door[3]) // 2) < 3:
                    c = (230, 200, 120)  # handle
            if bed_box[0] <= x <= bed_box[2] and bed_box[1] <= y <= bed_box[3]:
                top = bed_box[1] + int((bed_box[3] - bed_box[1]) * 0.35)
                c = (245, 245, 240) if y < top else bed
                if bed_box[0] <= x <= bed_box[0] + 60 and bed_box[1] + 4 <= y <= top - 4:
                    c = (255, 255, 255)  # pillow
            row.extend(c)
        rows.append(bytes(row))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


async def get_or_create_users(db) -> list[User]:
    users = []
    now = datetime.now(UTC)
    for phone, name, role in SEED_USERS:
        user = await db.scalar(select(User).where(User.phone == phone))
        if user is None:
            user = User(phone=phone, full_name=name, role=role, onboarding_completed=True, phone_verified_at=now)
            db.add(user)
        if user.password_hash is None:
            user.password_hash = hash_password(SEED_PASSWORD)
        users.append(user)
    await db.flush()
    return users


async def main(reset: bool) -> None:
    random.seed(42)  # same data every time
    storage = get_storage()
    can_store_photos = isinstance(storage, LocalStorage)

    async with SessionLocal() as db:
        users = await get_or_create_users(db)
        user_ids = [u.id for u in users]
        existing = await db.scalar(select(Listing.id).where(Listing.owner_id.in_(user_ids)).limit(1))
        if existing and not reset:
            await db.commit()  # saves test-account passwords if they were missing
            print(f"Seed data already exists (test password: {SEED_PASSWORD}). Use --reset to recreate it.")
            return
        if reset:
            await db.execute(delete(Listing).where(Listing.owner_id.in_(user_ids)))

        areas = [p for p in PLACES if p.kind == "area"]
        now = datetime.now(UTC)
        for i in range(30):
            place = areas[i % len(areas)]
            lat, lng = jitter(place.lat, place.lng, 50, 700)
            ltype = random.choice(list(ListingType))
            low, high = RENT_RANGE[ltype]
            rent = random.randrange(low, high + 1, 500)
            owner = users[i % 3]
            listing = Listing(
                owner_id=owner.id,
                listing_type=ltype,
                status=ListingStatus.ACTIVE,
                title=random.choice(TITLES[ltype]).format(p=place.name),
                description="Seed listing for testing. Clean, safe neighbourhood, close to the main road.",
                rent=rent,
                deposit=rent * random.choice([1, 2]),
                water_charge=random.choice([0, 300, 500, 800]),
                waste_charge=random.choice([0, 100, 200]),
                internet_charge=random.choice([0, 0, 800, 1000]),
                parking_charge=random.choice([0, 0, 300, 500]),
                agent_commission=random.choice([0, rent // 2]) if owner.role == UserRole.AGENT else None,
                amenities=[a.value for a in random.sample(list(Amenity), random.randint(2, 7))],
                furnishing=random.choice(list(Furnishing)),
                floor=random.randint(0, 5),
                max_occupants=random.randint(1, 6),
                available_from=date.today() + timedelta(days=random.randint(0, 30)),
                area=place.name,
                landmark=None,
                lat=lat,
                lng=lng,
                location=point_wkt(lat, lng),
                published_at=now - timedelta(days=random.randint(1, 20)),
                # spread "confirmed X hours ago" from minutes to ~3 days
                last_confirmed_at=now - timedelta(minutes=random.randint(5, 70 * 60)),
            )
            listing.public_lat, listing.public_lng = jitter(lat, lng)
            db.add(listing)
            await db.flush()

            if can_store_photos:
                for pos in range(random.randint(1, 3)):
                    key = build_photo_key(listing.id, "image/png")
                    data = placeholder_png(i * 10 + pos)
                    storage.write(key, data)
                    db.add(ListingPhoto(listing_id=listing.id, storage_key=key, content_type="image/png",
                                        size_bytes=len(data), position=pos, status=PhotoStatus.UPLOADED))
        await db.commit()

    print(f"✅ Created 30 listings. Test accounts (password: {SEED_PASSWORD}):")
    for phone, name, role in SEED_USERS:
        print(f"   {phone[4:]}  {name} ({role.value})")
    if not can_store_photos:
        print("   (photos skipped: STORAGE_BACKEND is not 'local')")
    print(f"Try: {settings.PUBLIC_BASE_URL}{settings.API_V1_PREFIX}/search/listings?place=koteshwor&radius_km=3")


if __name__ == "__main__":
    asyncio.run(main(reset="--reset" in sys.argv))
