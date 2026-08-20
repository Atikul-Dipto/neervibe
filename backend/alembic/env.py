"""Alembic migration environment. Uses the sync psycopg2 URL and imports every
ORM model (via app.models) so autogenerate sees the complete metadata,
including PostGIS geography columns registered by GeoAlchemy2.
"""
from logging.config import fileConfig

import geoalchemy2
from alembic import context
from sqlalchemy import engine_from_config, pool, text

from app.core.config import settings
from app.core.database import Base
from app.models import *  # noqa: F401,F403  (registers all tables on Base.metadata)

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url_sync)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# PostGIS (and its bundled postgis_tiger_geocoder/postgis_topology extensions)
# create dozens of its own tables in the same 'public' schema our app tables
# live in. Autogenerate can't tell those apart from tables we actually own,
# so it proposes dropping them. Query pg_depend for anything owned by an
# extension and exclude it from comparison — this is extension-version
# agnostic, unlike hardcoding PostGIS's table names.
EXTENSION_OWNED_TABLES_QUERY = text(
    """
    SELECT c.relname
    FROM pg_depend d
    JOIN pg_extension e ON d.refobjid = e.oid
    JOIN pg_class c ON d.objid = c.oid
    WHERE d.deptype = 'e' AND c.relkind IN ('r', 'v')
    """
)


def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and name in _extension_owned_tables:
        return False
    return True


def render_item(type_, obj, autogen_context):
    # Autogenerate renders GeoAlchemy2 column types as `geoalchemy2.types.X(...)`
    # but doesn't add the import on its own — add it explicitly so generated
    # migrations are runnable as-is.
    if type_ == "type" and isinstance(obj, geoalchemy2.types._GISType):
        autogen_context.imports.add("import geoalchemy2")
    return False


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    global _extension_owned_tables

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        _extension_owned_tables = {
            row[0] for row in connection.execute(EXTENSION_OWNED_TABLES_QUERY)
        }
        # That SELECT auto-begins an implicit transaction on this connection.
        # Close it out here so context.begin_transaction() below starts a
        # fresh transaction it actually owns and commits — otherwise
        # Connection.close() silently rolls back everything the migration
        # just did.
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
            render_item=render_item,
        )
        with context.begin_transaction():
            context.run_migrations()


_extension_owned_tables: set[str] = set()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
