"""Import every model here so Alembic's autogenerate can see all tables.
When you add a module (listings, media, ...), add its models import below."""
from app.core.database import Base  # noqa: F401
from app.modules.auth.models import RefreshToken  # noqa: F401
from app.modules.users.models import User  # noqa: F401
