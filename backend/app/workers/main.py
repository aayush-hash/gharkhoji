"""Background worker process (runs as its own container: see docker-compose.yml).

    python -m app.workers.main           # run forever, every WORKER_INTERVAL_SECONDS
    python -m app.workers.main --once    # run one cycle now and exit (handy for testing)

A Redis lock makes sure only one worker runs a cycle at a time, even if you later
run several worker containers.
"""
import asyncio
import logging
import signal
import sys

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.redis import redis_client
from app.workers.availability import run_cycle

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("gharkhoji.worker")

LOCK_KEY = "worker:availability:lock"


async def run_once() -> None:
    # The lock expires by itself, so a crashed worker never blocks the others forever.
    got_lock = await redis_client.set(LOCK_KEY, "1", nx=True, ex=max(60, settings.WORKER_INTERVAL_SECONDS - 5))
    if not got_lock:
        logger.info("Another worker is running this cycle; skipping")
        return
    try:
        async with SessionLocal() as db:
            result = await run_cycle(db)
        logger.info("Cycle done: %d expired, %d reminded", result.expired, result.reminded)
    finally:
        await redis_client.delete(LOCK_KEY)


async def main(once: bool) -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    logger.info("Worker started (every %ss)", settings.WORKER_INTERVAL_SECONDS)
    try:
        while not stop.is_set():
            try:
                await run_once()
            except Exception:  # keep the worker alive; the error is logged with details
                logger.exception("Worker cycle failed")
            if once:
                break
            try:
                await asyncio.wait_for(stop.wait(), timeout=settings.WORKER_INTERVAL_SECONDS)
            except TimeoutError:
                pass
    finally:
        await redis_client.aclose()
        await engine.dispose()
        logger.info("Worker stopped")


if __name__ == "__main__":
    asyncio.run(main(once="--once" in sys.argv))
