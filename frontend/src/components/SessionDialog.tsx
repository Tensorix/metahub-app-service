import { useState, useEffect } from 'react';
import type { Session, SessionCreate, SessionUpdate } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface SessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: Session;
  onSubmit: (data: SessionCreate | SessionUpdate) => Promise<void>;
}

export function SessionDialog({ open, onOpenChange, session, onSubmit }: SessionDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('pm');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) {
      setName(session.name || '');
      setType(session.type);
      setSource(session.source || '');
    } else {
      setName('');
      setType('pm');
      setSource('');
    }
  }, [session, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        name: name || undefined,
        type,
        source: source || undefined,
      };

      await onSubmit(data);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save session:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{session ? '编辑会话' : '创建会话'}</DialogTitle>
          <DialogDescription>
            {session ? '修改会话信息' : '创建一个新的会话'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">会话名称</Label>
              <Input
                id="name"
                placeholder="输入会话名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">会话类型</Label>
              <select
                id="type"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="pm">私聊</option>
                <option value="group">群聊</option>
                <option value="ai">AI</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="source">来源</Label>
              <Input
                id="source"
                placeholder="例如: astr_wechat, astr_qq"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
