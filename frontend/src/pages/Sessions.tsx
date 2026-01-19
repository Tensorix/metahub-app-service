import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export function Sessions() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">会话管理</h1>
        <p className="text-muted-foreground mt-2">
          管理您的所有会话
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>会话列表</CardTitle>
          <CardDescription>您的会话将显示在这里</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            暂无会话数据
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
