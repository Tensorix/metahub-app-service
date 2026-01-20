// 运行时配置文件
// 此文件会在容器启动时被环境变量替换
window.__APP_CONFIG__ = {
  API_BASE_URL: '${VITE_API_BASE_URL}',
  PASSWORD_STRENGTH_CHECK: '${VITE_PASSWORD_STRENGTH_CHECK}',
};
