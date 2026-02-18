import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import bcrypt
from jose import jwt, JWTError
from sqlalchemy import or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.config import config
from app.db.model.user import User, UserToken
from app.schema.auth import RegisterRequest, LoginRequest


class PasswordService:
    """密码处理服务"""

    @staticmethod
    def hash_password(sha256_password: str) -> str:
        """
        对 SHA256 哈希后的密码进行 bcrypt 哈希
        
        使用 bcrypt 直接哈希，不再依赖 passlib
        """
        # 将 SHA256 哈希转换为字节
        password_bytes = sha256_password.encode('utf-8')
        # 生成盐并哈希
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password_bytes, salt)
        # 返回字符串形式
        return hashed.decode('utf-8')

    @staticmethod
    def verify_password(sha256_password: str, hashed_password: str) -> bool:
        """验证密码"""
        password_bytes = sha256_password.encode('utf-8')
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(password_bytes, hashed_bytes)

    @staticmethod
    def check_password_strength(password: str) -> tuple[bool, str | None]:
        """
        密码强度校验 (校验原始密码，非 SHA256 哈希后的)
        返回: (是否通过, 错误信息)
        """
        if not config.PASSWORD_STRENGTH_CHECK:
            return True, None

        if len(password) < 8:
            return False, "密码长度至少 8 位"
        if not re.search(r"[A-Z]", password):
            return False, "密码需包含大写字母"
        if not re.search(r"[a-z]", password):
            return False, "密码需包含小写字母"
        if not re.search(r"\d", password):
            return False, "密码需包含数字"
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
            return False, "密码需包含特殊字符"
        return True, None


class TokenService:
    """JWT Token 服务"""

    @staticmethod
    def create_access_token(user_id: UUID, username: str) -> str:
        """创建 access_token"""
        expire = datetime.now(timezone.utc) + timedelta(minutes=config.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
        payload = {
            "sub": str(user_id),
            "username": username,
            "type": "access",
            "exp": expire,
            "iat": datetime.now(timezone.utc),
        }
        return jwt.encode(payload, config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)

    @staticmethod
    def create_refresh_token(user_id: UUID) -> tuple[str, datetime]:
        """创建 refresh_token，返回 (token, 过期时间)

        使用 jti (JWT ID) 确保每个 token 唯一，避免并发刷新时因 iat 相同导致 hash 冲突。
        """
        now = datetime.now(timezone.utc)
        expire = now + timedelta(days=config.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        payload = {
            "sub": str(user_id),
            "type": "refresh",
            "jti": str(uuid4()),  # 唯一标识，防止并发刷新生成相同 token
            "exp": expire,
            "iat": now,
        }
        token = jwt.encode(payload, config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
        return token, expire

    @staticmethod
    def decode_token(token: str) -> dict | None:
        """解码 token，失败返回 None"""
        try:
            payload = jwt.decode(token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
            return payload
        except JWTError:
            return None

    @staticmethod
    def hash_refresh_token(token: str) -> str:
        """对 refresh_token 进行哈希存储"""
        return hashlib.sha256(token.encode()).hexdigest()


class AuthService:
    """认证服务"""

    @staticmethod
    def register(db: Session, data: RegisterRequest) -> User | None:
        """用户注册"""
        # 检查用户名是否已存在
        existing = db.query(User).filter(User.username == data.username).first()
        if existing:
            return None

        # 检查邮箱是否已存在
        if data.email:
            existing = db.query(User).filter(User.email == data.email).first()
            if existing:
                return None

        # 检查手机号是否已存在
        if data.phone:
            existing = db.query(User).filter(User.phone == data.phone).first()
            if existing:
                return None

        user = User(
            username=data.username,
            email=data.email,
            phone=data.phone,
            password_hash=PasswordService.hash_password(data.password),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def authenticate(db: Session, username: str, password: str) -> User | None:
        """验证用户凭据，支持用户名/邮箱/手机号登录"""
        user = db.query(User).filter(
            or_(
                User.username == username,
                User.email == username,
                User.phone == username,
            )
        ).first()

        if not user:
            return None
        if not user.is_active:
            return None
        if not PasswordService.verify_password(password, user.password_hash):
            return None
        return user

    @staticmethod
    def create_tokens(db: Session, user: User, client_type: str, device_info: str | None) -> tuple[str, str]:
        """创建 access_token 和 refresh_token，并存储 refresh_token"""
        access_token = TokenService.create_access_token(user.id, user.username)
        refresh_token, expires_at = TokenService.create_refresh_token(user.id)

        # 存储 refresh_token
        token_record = UserToken(
            user_id=user.id,
            refresh_token_hash=TokenService.hash_refresh_token(refresh_token),
            client_type=client_type,
            device_info=device_info,
            expires_at=expires_at,
        )
        db.add(token_record)
        db.commit()

        return access_token, refresh_token

    @staticmethod
    def refresh_access_token(db: Session, refresh_token: str) -> tuple[str, str] | None:
        """刷新 access_token，返回新的 (access_token, refresh_token) 或 None"""
        # 解码 refresh_token
        payload = TokenService.decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            logger.warning("Refresh token 解码失败或类型不匹配")
            return None

        user_id = payload.get("sub")
        if not user_id:
            logger.warning("Refresh token payload 中缺少 sub 字段")
            return None

        # 查找 token 记录（加行锁防止并发刷新同一 token）
        token_hash = TokenService.hash_refresh_token(refresh_token)
        token_record = db.query(UserToken).filter(
            UserToken.refresh_token_hash == token_hash,
            UserToken.is_revoked == False,
        ).with_for_update().first()

        if not token_record:
            # 检查是否是已撤销的 token（竞态条件或重复使用）
            revoked_record = db.query(UserToken).filter(
                UserToken.refresh_token_hash == token_hash,
                UserToken.is_revoked == True,
            ).first()
            if revoked_record:
                logger.warning(
                    "Refresh token 已被撤销 (user_id=%s)，可能是并发刷新或 token 重用",
                    user_id,
                )
            else:
                logger.warning(
                    "Refresh token hash 在数据库中不存在 (user_id=%s)",
                    user_id,
                )
            return None

        # 检查是否过期
        if token_record.expires_at < datetime.now(timezone.utc):
            logger.warning(
                "Refresh token 已过期 (user_id=%s, expired_at=%s)",
                user_id, token_record.expires_at,
            )
            return None

        # 获取用户
        user = db.query(User).filter(User.id == token_record.user_id, User.is_active == True).first()
        if not user:
            logger.warning("用户不存在或已停用 (user_id=%s)", user_id)
            return None

        # 撤销旧 token
        token_record.is_revoked = True

        # 创建新 tokens
        access_token, new_refresh_token = AuthService.create_tokens(
            db, user, token_record.client_type, token_record.device_info
        )

        return access_token, new_refresh_token

    @staticmethod
    def logout(db: Session, user_id: UUID, refresh_token: str | None = None) -> bool:
        """登出，撤销 token"""
        if refresh_token:
            # 撤销指定 token
            token_hash = TokenService.hash_refresh_token(refresh_token)
            token_record = db.query(UserToken).filter(
                UserToken.refresh_token_hash == token_hash,
                UserToken.user_id == user_id,
            ).first()
            if token_record:
                token_record.is_revoked = True
                db.commit()
        else:
            # 撤销该用户所有 token
            db.query(UserToken).filter(
                UserToken.user_id == user_id,
                UserToken.is_revoked == False,
            ).update({"is_revoked": True})
            db.commit()
        return True

    @staticmethod
    def get_user_by_id(db: Session, user_id: UUID) -> User | None:
        """根据 ID 获取用户"""
        return db.query(User).filter(User.id == user_id, User.is_active == True).first()
