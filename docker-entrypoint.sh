#!/bin/bash
set -e

# ============================================
# Docker Entrypoint Script
# 用于在容器启动时注入运行时环境变量到前端配置
# ============================================

echo "🚀 Starting Metahub App Service..."

# ============================================
# 前端运行时配置注入
# ============================================
if [ -f "/app/frontend/dist/config.js" ]; then
    echo "📝 Injecting frontend runtime environment variables..."
    
    # 设置默认值
    export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:8000}"
    export VITE_PASSWORD_STRENGTH_CHECK="${VITE_PASSWORD_STRENGTH_CHECK:-false}"
    
    # 替换 config.js 中的占位符
    envsubst < /app/frontend/dist/config.js > /app/frontend/dist/config.js.tmp
    mv /app/frontend/dist/config.js.tmp /app/frontend/dist/config.js
    
    echo "✅ Frontend environment variables injected:"
    echo "   VITE_API_BASE_URL: ${VITE_API_BASE_URL}"
    echo "   VITE_PASSWORD_STRENGTH_CHECK: ${VITE_PASSWORD_STRENGTH_CHECK}"
else
    echo "⚠️  Frontend config.js not found, skipping injection"
fi

echo ""

# ============================================
# 数据库迁移（可选）
# ============================================
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
    echo "🔄 Running database migrations..."
    alembic upgrade head
    echo "✅ Migrations completed"
    echo ""
fi

# ============================================
# 启动应用
# ============================================
echo "🎯 Starting application server..."
echo "   Listening on: 0.0.0.0:8000"
echo ""

# 执行传入的命令（通常是 gunicorn）
exec "$@"
