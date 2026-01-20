import secrets
from uuid import UUID
from sqlalchemy.orm import Session

from app.db.model.user import User


class ApiKeyService:
    """API Key 管理服务"""

    @staticmethod
    def generate_api_key() -> str:
        """
        生成一个优雅的 API Key
        格式: sk-{32字符随机字符串}
        使用 URL 安全的 base64 编码
        """
        random_part = secrets.token_urlsafe(24)  # 生成 32 字符的 URL 安全字符串
        return f"sk-{random_part}"

    @staticmethod
    def create_api_key(db: Session, user_id: UUID) -> str | None:
        """为用户创建 API Key"""
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None

        # 如果已有 api_key，返回现有的
        if user.api_key:
            return user.api_key

        # 生成新的 api_key
        api_key = ApiKeyService.generate_api_key()
        user.api_key = api_key
        db.commit()
        db.refresh(user)
        return api_key

    @staticmethod
    def reset_api_key(db: Session, user_id: UUID) -> str | None:
        """重置用户的 API Key"""
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None

        # 生成新的 api_key
        api_key = ApiKeyService.generate_api_key()
        user.api_key = api_key
        db.commit()
        db.refresh(user)
        return api_key

    @staticmethod
    def get_api_key(db: Session, user_id: UUID) -> str | None:
        """获取用户的 API Key"""
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return None
        return user.api_key

    @staticmethod
    def verify_api_key(db: Session, api_key: str) -> User | None:
        """验证 API Key 并返回对应的用户"""
        user = db.query(User).filter(
            User.api_key == api_key,
            User.is_active == True
        ).first()
        return user
