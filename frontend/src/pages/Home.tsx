import { useAuthStore } from '../store/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export function Home() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Hi, {user?.username} 👋
        </h1>
        <p className="text-muted-foreground mt-2">
          欢迎回到 MetaHub
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>账户信息</CardTitle>
            <CardDescription>您的个人资料</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">用户名</span>
              <span className="text-sm font-medium">{user?.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">邮箱</span>
              <span className="text-sm font-medium">{user?.email || '未设置'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">手机号</span>
              <span className="text-sm font-medium">{user?.phone || '未设置'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">账户状态</span>
              <span className="text-sm font-medium">
                {user?.is_active ? '✅ 已激活' : '❌ 未激活'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>快速开始</CardTitle>
            <CardDescription>开始使用 MetaHub</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              探索侧边栏的功能，开始您的旅程。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>系统信息</CardTitle>
            <CardDescription>关于您的账户</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">注册时间</span>
              <span className="text-sm font-medium">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">权限</span>
              <span className="text-sm font-medium">
                {user?.is_superuser ? '管理员' : '普通用户'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
