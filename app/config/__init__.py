"""Configuration module for the application."""

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

    # 是否在消息创建时立即触发 embedding 生成（后台任务异步处理）
    # True: 收到消息后立即在后台任务中生成 embedding
    # False: 不自动生成，需要手动运行脚本处理 pending embeddings
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

    # 最短可索引文本长度（少于此长度跳过 embedding）
    SEARCH_MIN_CONTENT_LENGTH: int = 2

    # 需要索引的 session 类型
    SEARCH_INDEXABLE_SESSION_TYPES: list[str] = ["pm", "group"]

    # ============ MCP Client 配置 ============
    MCP_CLIENT_TIMEOUT: int = 30            # MCP 工具调用超时（秒）
    MCP_CONNECTION_TIMEOUT: int = 10        # MCP Server 连接超时（秒）
    MCP_MAX_RETRIES: int = 3               # MCP 调用失败重试次数
    MCP_TOOL_CACHE_TTL: int = 300          # MCP 工具列表缓存时间（秒）
    MCP_MAX_SERVERS_PER_AGENT: int = 10    # 每个 Agent 最多连接的 MCP Server 数

    @computed_field
    @property
    def sqlalchemy_database_uri(self) -> str:
        password = quote_plus(self.POSTGRES_PASSWORD)
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{password}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )


config = Settings()
