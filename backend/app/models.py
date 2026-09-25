"""Import every model here so Alembic's autogenerate can see all tables.
When you add a module, add its models import below."""
from app.core.database import Base  # noqa: F401
from app.modules.auth.models import RefreshToken  # noqa: F401
from app.modules.chat.models import ChatReport, Conversation, Message  # noqa: F401
from app.modules.favorites.models import Favorite  # noqa: F401
from app.modules.listings.models import Listing  # noqa: F401
from app.modules.media.models import ListingPhoto  # noqa: F401
from app.modules.notifications.models import PushToken  # noqa: F401
from app.modules.users.models import User  # noqa: F401
