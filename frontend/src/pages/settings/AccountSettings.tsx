import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';

export function AccountSettings() {
  return (
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
  );
}
