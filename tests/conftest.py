"""
Pytest configuration and fixtures
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.config import config
from app.db.model.base import Base


@pytest.fixture(scope="session")
def engine():
    """Create database engine for testing"""
    engine = create_engine(config.sqlalchemy_database_uri)
    return engine


@pytest.fixture(scope="function")
def db(engine) -> Session:
    """Create a new database session for a test"""
    connection = engine.connect()
    transaction = connection.begin()
    SessionLocal = sessionmaker(bind=connection)
    session = SessionLocal()
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()
