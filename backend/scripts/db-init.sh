#!/bin/bash
# Runs ONCE, the first time the Postgres container starts with an empty data volume.
# Creates:
#   - gharkhoji_app: the user the API logs in as. Not a superuser; it can't create
#     databases or roles, and it owns only the GharKhoji databases.
#   - gharkhoji_test: a separate database for automated tests.
# Nobody else (PUBLIC) may even connect to these databases.
set -e

: "${APP_DB_USER:?APP_DB_USER is not set}"
: "${APP_DB_PASSWORD:?APP_DB_PASSWORD is not set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
     -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" <<'EOSQL'
CREATE ROLE :"app_user" LOGIN PASSWORD :'app_password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    CONNECTION LIMIT 50;
ALTER DATABASE gharkhoji OWNER TO :"app_user";
CREATE DATABASE gharkhoji_test OWNER :"app_user";
REVOKE ALL ON DATABASE gharkhoji FROM PUBLIC;
REVOKE ALL ON DATABASE gharkhoji_test FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;   -- the admin database is superuser-only
EOSQL

# PostGIS must be installed by the superuser; the app user then just uses it.
for db in gharkhoji gharkhoji_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS postgis;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
EOSQL
done

echo "GharKhoji: created database user '$APP_DB_USER' and test database"
