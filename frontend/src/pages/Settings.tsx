import { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { GeneralSettings } from './settings/GeneralSettings';
import { ProviderSettings } from './settings/ProviderSettings';
import { MessageAnalyzerSettings } from './settings/MessageAnalyzerSettings';
import { EmbeddingSettings } from './settings/EmbeddingSettings';
import { AccountSettings } from './settings/AccountSettings';
import { usePageTitle } from '@/contexts/PageTitleContext';
import { useBreakpoints } from '@/hooks/useMediaQuery';

export function Settings() {
  const { setTitle, setActions } = usePageTitle();
  const { isMobile } = useBreakpoints();

  useEffect(() => {
    if (isMobile) {
      setTitle('设置');
      setActions([]);
    } else {
      setTitle(null);
      setActions([]);
    }

    return () => {
      setTitle(null);
      setActions([]);
    };
  }, [isMobile, setTitle, setActions]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {!isMobile && (
        <div className="shrink-0 pb-4">
          <h1 className="text-3xl font-bold tracking-tight">设置</h1>
          <p className="text-muted-foreground mt-2">管理您的应用偏好设置</p>
        </div>
      )}

      <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 overflow-x-auto scrollbar-hide">
          <TabsList className="w-max">
            <TabsTrigger value="general">通用设置</TabsTrigger>
            <TabsTrigger value="providers">模型服务</TabsTrigger>
            <TabsTrigger value="message-analyzer">消息分析</TabsTrigger>
            <TabsTrigger value="embedding">向量嵌入</TabsTrigger>
            <TabsTrigger value="account">账户</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 mt-4">
          <TabsContent value="general" className="mt-0">
            <GeneralSettings />
          </TabsContent>
          <TabsContent value="providers" className="mt-0">
            <ProviderSettings />
          </TabsContent>
          <TabsContent value="message-analyzer" className="mt-0">
            <MessageAnalyzerSettings />
          </TabsContent>
          <TabsContent value="embedding" className="mt-0">
            <EmbeddingSettings />
          </TabsContent>
          <TabsContent value="account" className="mt-0">
            <AccountSettings />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
