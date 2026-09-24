-- Runs once, the first time the Postgres container starts. Creates a separate DB for tests.
CREATE DATABASE gharkhoji_test;
\c gharkhoji_test
CREATE EXTENSION IF NOT EXISTS postgis;
