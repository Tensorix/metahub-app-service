import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { useThemeStore } from '../store/theme';
import { Button } from '../components/ui/button';

export function Settings() {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">设置</h1>
        <p className="text-muted-foreground mt-2">
          管理您的应用偏好设置
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>外观</CardTitle>
          <CardDescription>自定义应用的外观和主题</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>主题模式</Label>
            <div className="flex gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => setTheme('light')}
              >
                浅色
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => setTheme('dark')}
              >
                深色
              </Button>
              <Button
                variant={theme === 'system' ? 'default' : 'outline'}
                onClick={() => setTheme('system')}
              >
                跟随系统
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>账户</CardTitle>
          <CardDescription>管理您的账户设置</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            账户管理功能即将推出
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
