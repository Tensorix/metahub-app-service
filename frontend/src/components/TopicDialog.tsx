import { useState, useEffect } from 'react';
import type { Topic, TopicCreate, TopicUpdate } from '@/lib/api';
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

interface TopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string;
  topic?: Topic;
  onSubmit: (data: TopicCreate | TopicUpdate) => Promise<void>;
}

export function TopicDialog({ open, onOpenChange, sessionId, topic, onSubmit }: TopicDialogProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (topic) {
      setName(topic.name || '');
    } else {
      setName('');
    }
  }, [topic, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (topic) {
        await onSubmit({ name: name || undefined });
      } else if (sessionId) {
        await onSubmit({ name: name || undefined, session_id: sessionId });
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save topic:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{topic ? '编辑话题' : '创建话题'}</DialogTitle>
          <DialogDescription>
            {topic ? '修改话题名称' : '为会话创建一个新话题'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">话题名称</Label>
              <Input
                id="name"
                placeholder="输入话题名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
