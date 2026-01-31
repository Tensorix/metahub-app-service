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
    AGENT_DEFAULT_MODEL: str = "gpt-4o-mini"
    AGENT_DEFAULT_PROVIDER: str = "openai"

    # ============ 搜索配置 ============
    
    # 上下文窗口大小：无 topic 时返回命中消息前后各 N 条
    SEARCH_CONTEXT_WINDOW_SIZE: int = 5
    
    # 是否在消息创建时同步生成 embedding
    SEARCH_SYNC_EMBEDDING: bool = True
    
    # 模糊搜索最低相似度阈值 (0.0 - 1.0)
    SEARCH_FUZZY_THRESHOLD: float = 0.1
    
    # 向量搜索最低相似度阈值 (0.0 - 1.0)
    SEARCH_VECTOR_THRESHOLD: float = 0.3
    
    # 混合搜索权重
    SEARCH_FUZZY_WEIGHT: float = 0.4
    SEARCH_VECTOR_WEIGHT: float = 0.6
    
    # 默认返回结果数量
    SEARCH_DEFAULT_TOP_K: int = 20
    
    # Embedding 模型
    SEARCH_EMBEDDING_MODEL: str = "text-embedding-3-large"
    SEARCH_EMBEDDING_DIMENSIONS: int = 3072
    
    # 最短可索引文本长度（少于此长度跳过 embedding）
    SEARCH_MIN_CONTENT_LENGTH: int = 2
    
    # 批量 embedding 处理大小
    SEARCH_EMBEDDING_BATCH_SIZE: int = 100
    
    # 需要索引的 session 类型
    SEARCH_INDEXABLE_SESSION_TYPES: list[str] = ["pm", "group"]

    @computed_field
    @property
    def sqlalchemy_database_uri(self) -> str:
        password = quote_plus(self.POSTGRES_PASSWORD)
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{password}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )
config = Settings()
