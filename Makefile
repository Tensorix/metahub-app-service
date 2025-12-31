.PHONY: help init install dev build start clean test lint format docker-build docker-run docker-stop backend-dev frontend-dev

# Variables
PYTHON := python3
UV := uv
VENV := .venv
FRONTEND_DIR := frontend
DOCKER_IMAGE := metahub-app-service
DOCKER_CONTAINER := metahub-app-service-container

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-18s$(NC) %s\n", $$1, $$2}'

# Initialization command
init: ## Initialize project with custom name and settings
	@bash scripts/init-project.sh

# Installation commands
install: ## Install all dependencies (backend + frontend)
	@echo "$(BLUE)Installing backend dependencies with uv...$(NC)"
	$(UV) sync
	@echo "$(BLUE)Installing frontend dependencies with bun...$(NC)"
	cd $(FRONTEND_DIR) && bun install
	@echo "$(GREEN)All dependencies installed!$(NC)"

install-backend: ## Install only backend dependencies
	@echo "$(BLUE)Installing backend dependencies...$(NC)"
	$(UV) sync

install-frontend: ## Install only frontend dependencies
	@echo "$(BLUE)Installing frontend dependencies...$(NC)"
	cd $(FRONTEND_DIR) && bun install

# Development commands
dev: build ## Build frontend and run backend (single terminal)
	@echo "$(BLUE)Starting backend with built frontend...$(NC)"
	$(UV) run python main.py

dev-watch: ## Run backend and frontend in separate terminals (hot reload)
	@echo "$(BLUE)Starting development servers...$(NC)"
	@echo "$(YELLOW)Run 'make backend-dev' and 'make frontend-dev' in separate terminals$(NC)"

backend-dev: ## Run backend in development mode with hot reload
	@echo "$(BLUE)Starting FastAPI backend...$(NC)"
	$(UV) run python main.py

frontend-dev: ## Run frontend in development mode with hot reload
	@echo "$(BLUE)Starting Vite frontend...$(NC)"
	cd $(FRONTEND_DIR) && bun run dev

# Build commands
build: ## Build frontend for production
	@echo "$(BLUE)Building frontend...$(NC)"
	cd $(FRONTEND_DIR) && bun run build
	@echo "$(GREEN)Frontend built successfully!$(NC)"

build-all: install build ## Install dependencies and build everything

# Start production server
start: build ## Build and start production server
	@echo "$(BLUE)Starting production server...$(NC)"
	$(UV) run gunicorn -k uvicorn.workers.UvicornWorker -w 4 app.api:app --bind 0.0.0.0:8000

# Testing commands
test: ## Run all tests
	@echo "$(BLUE)Running tests...$(NC)"
	$(UV) run pytest

test-watch: ## Run tests in watch mode
	@echo "$(BLUE)Running tests in watch mode...$(NC)"
	$(UV) run pytest-watch

# Linting and formatting
lint: ## Run linters for backend and frontend
	@echo "$(BLUE)Linting backend...$(NC)"
	$(UV) run ruff check .
	@echo "$(BLUE)Linting frontend...$(NC)"
	cd $(FRONTEND_DIR) && bun run lint

lint-fix: ## Fix linting issues automatically
	@echo "$(BLUE)Fixing backend linting issues...$(NC)"
	$(UV) run ruff check --fix .
	@echo "$(BLUE)Fixing frontend linting issues...$(NC)"
	cd $(FRONTEND_DIR) && bun run lint --fix

format: ## Format code
	@echo "$(BLUE)Formatting backend code...$(NC)"
	$(UV) run ruff format .
	@echo "$(BLUE)Formatting frontend code...$(NC)"
	cd $(FRONTEND_DIR) && bun run lint --fix

# Docker commands
docker-build: ## Build Docker image
	@echo "$(BLUE)Building Docker image...$(NC)"
	docker build -t $(DOCKER_IMAGE) .
	@echo "$(GREEN)Docker image built successfully!$(NC)"

docker-run: ## Run Docker container
	@echo "$(BLUE)Starting Docker container...$(NC)"
	docker run -d --name $(DOCKER_CONTAINER) -p 8000:8000 --env-file .env $(DOCKER_IMAGE)
	@echo "$(GREEN)Container started! Access at http://localhost:8000$(NC)"

docker-stop: ## Stop and remove Docker container
	@echo "$(BLUE)Stopping Docker container...$(NC)"
	docker stop $(DOCKER_CONTAINER) || true
	docker rm $(DOCKER_CONTAINER) || true

docker-logs: ## Show Docker container logs
	docker logs -f $(DOCKER_CONTAINER)

docker-shell: ## Open shell in running Docker container
	docker exec -it $(DOCKER_CONTAINER) /bin/bash

# Cleanup commands
clean: ## Clean all generated files and dependencies
	@echo "$(BLUE)Cleaning up...$(NC)"
	rm -rf $(VENV)
	rm -rf .pytest_cache
	rm -rf .ruff_cache
	cd $(FRONTEND_DIR) && rm -rf node_modules dist .vite
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "$(GREEN)Cleanup complete!$(NC)"

clean-frontend: ## Clean only frontend build artifacts
	@echo "$(BLUE)Cleaning frontend...$(NC)"
	cd $(FRONTEND_DIR) && rm -rf node_modules dist .vite

clean-backend: ## Clean only backend artifacts
	@echo "$(BLUE)Cleaning backend...$(NC)"
	rm -rf $(VENV) .pytest_cache .ruff_cache
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true

# Database commands (if needed)
db-migrate: ## Run database migrations
	@echo "$(BLUE)Running database migrations...$(NC)"
	$(UV) run alembic upgrade head

db-rollback: ## Rollback last database migration
	@echo "$(BLUE)Rolling back database migration...$(NC)"
	$(UV) run alembic downgrade -1

db-reset: ## Reset database
	@echo "$(YELLOW)This will drop all tables!$(NC)"
	$(UV) run alembic downgrade base
	$(UV) run alembic upgrade head

# Utility commands
check: ## Check code quality (lint + type check)
	@echo "$(BLUE)Checking code quality...$(NC)"
	$(UV) run ruff check .
	$(UV) run mypy .
	cd $(FRONTEND_DIR) && bun run lint

env: ## Create .env file from .env.example
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(GREEN).env file created from .env.example$(NC)"; \
	else \
		echo "$(YELLOW).env file already exists$(NC)"; \
	fi

update: ## Update all dependencies
	@echo "$(BLUE)Updating backend dependencies...$(NC)"
	$(UV) sync --upgrade
	@echo "$(BLUE)Updating frontend dependencies...$(NC)"
	cd $(FRONTEND_DIR) && bun update

info: ## Show project information
	@echo "$(BLUE)Project Information:$(NC)"
	@echo "  Python version: $$($(PYTHON) --version)"
	@echo "  UV version: $$($(UV) --version)"
	@echo "  Node version: $$(node --version)"
	@echo "  Bun version: $$(bun --version)"
	@echo "  Docker version: $$(docker --version)"