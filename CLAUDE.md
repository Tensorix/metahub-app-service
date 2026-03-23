# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Install dependencies
uv sync

# Run dev server (hot reload)
uv run python main.py

# Run tests
uv run pytest
uv run pytest tests/test_session_api.py           # single file
uv run pytest tests/test_session_api.py::test_name # single test

# Lint & format
uv run ruff check .
uv run ruff check --fix .
uv run ruff format .

# Database migrations
uv run alembic upgrade head          # apply all
uv run alembic downgrade -1          # rollback one
uv run alembic revision --autogenerate -m "description"  # create migration
```

## Architecture

**Stack**: FastAPI + SQLAlchemy (sync) + PostgreSQL + deepagents (LangGraph-based agent framework)

**Entry point**: `main.py` → `app/api.py` (FastAPI app with lifespan). API routes at `/api/v1/...`, frontend served from `frontend/dist/`.

### Layer structure

```
app/db/model/*.py    → SQLAlchemy models (Base in base.py)
app/schema/*.py      → Pydantic request/response schemas
app/service/*.py     → Business logic (receives db: Session)
app/router/v1/*.py   → FastAPI route handlers
app/deps.py          → Dependency injection (get_db, etc.)
```

Models use UUID7 primary keys. Config via pydantic-settings in `app/config/__init__.py`, reads from `.env`.

### Agent system

The core differentiator. Located in `app/agent/`:

- **`deep_agent_service.py`** — Orchestrates agent invocation: builds config, invokes LangGraph agent, streams SSE responses
- **`factory.py`** — `AgentFactory` manages agent lifecycle, caching, and store initialization. Cache cleared via `clear_cache_cascade()` on config changes
- **`backends.py`** — Two-tier filesystem with `CompositeBackend`:
  - Root `/` → `ThreadScopedStoreBackend` (thread lifecycle, namespace `("topic_{topic_id}", "filesystem")`)
  - `/workspace/` → `StoreBackend` (session lifecycle, shared across threads)
- **`tools/`** — Tool registry and custom tool implementations
- **`mcp/`** — MCP (Model Context Protocol) client integration, tools cached per agent_id

**Key detail**: thread_id in the agent system is `f"topic_{topic.id}"` — any API code referencing thread storage must use this exact format.

### Database

Sync SQLAlchemy with `SessionLocal` sessionmaker. Alembic for migrations (config in `alembic.ini`, versions in `alembic/versions/`). Connection configured via `POSTGRES_*` env vars.

### Auth

JWT-based (`python-jose`). Config: `JWT_SECRET_KEY`, `JWT_ALGORITHM`, token expiry settings in config.

## Key Conventions

- Python 3.13+, async used only in agent/streaming paths; DB layer is sync
- `pytest-asyncio` with `asyncio_mode = "auto"` for async tests
- Agent config changes require `AgentFactory.clear_cache_cascade()` to take effect
- Mounted files (Agent.md, skills) written to store via `_write_mounted_files_to_store()` before each agent invoke
