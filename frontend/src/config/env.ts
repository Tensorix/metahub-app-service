// 环境变量配置管理
// 支持构建时和运行时两种方式

interface AppConfig {
  API_BASE_URL: string;
  PASSWORD_STRENGTH_CHECK: boolean;
}

// 从运行时配置获取值（优先级最高）
function getRuntimeConfig(): Partial<AppConfig> {
  const runtimeConfig = (window as any).__APP_CONFIG__;
  
  if (!runtimeConfig) {
    return {};
  }

  const config: Partial<AppConfig> = {};

  // 处理 API_BASE_URL
  if (runtimeConfig.API_BASE_URL && !runtimeConfig.API_BASE_URL.startsWith('${')) {
    config.API_BASE_URL = runtimeConfig.API_BASE_URL;
  }

  // 处理 PASSWORD_STRENGTH_CHECK
  if (runtimeConfig.PASSWORD_STRENGTH_CHECK && !runtimeConfig.PASSWORD_STRENGTH_CHECK.startsWith('${')) {
    config.PASSWORD_STRENGTH_CHECK = runtimeConfig.PASSWORD_STRENGTH_CHECK === 'true';
  }

  return config;
}

// 从构建时环境变量获取值（fallback）
function getBuildTimeConfig(): AppConfig {
  return {
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
    PASSWORD_STRENGTH_CHECK: import.meta.env.VITE_PASSWORD_STRENGTH_CHECK === 'true',
  };
}

// 合并配置：运行时配置优先于构建时配置
const buildTimeConfig = getBuildTimeConfig();
const runtimeConfig = getRuntimeConfig();

export const config: AppConfig = {
  ...buildTimeConfig,
  ...runtimeConfig,
};

// 导出便捷访问函数
export const getApiBaseUrl = () => config.API_BASE_URL;
export const isPasswordStrengthCheckEnabled = () => config.PASSWORD_STRENGTH_CHECK;

// 开发环境下打印配置信息
if (import.meta.env.DEV) {
  console.log('App Configuration:', config);
}
