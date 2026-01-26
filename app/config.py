from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import quote_plus

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    API_V1_STR: str = ""
    BACKEND_CORS_ORIGINS: list[str] = []

    @computed_field
    def CORS_ORIGINS(self) -> list[str]:
        return self.BACKEND_CORS_ORIGINS
    
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = False

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "testdb"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str
    POSTGRES_POOL_SIZE: int = 5
    POSTGRES_MAX_OVERFLOW: int = 10
    POSTGRES_TIMEZONE: str = "UTC"

    # JWT 配置
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # 密码策略
    PASSWORD_STRENGTH_CHECK: bool = False

    # OpenAI 配置（用于 LangChain Agent）
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"

    # Agent Chat 配置
    AGENT_MAX_ITERATIONS: int = 50
    AGENT_TIMEOUT: int = 300
    AGENT_DEFAULT_MODEL: str = "glm-4.7"

    @computed_field
    @property
    def sqlalchemy_database_uri(self) -> str:
        password = quote_plus(self.POSTGRES_PASSWORD)
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{password}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )
config = Settings()
