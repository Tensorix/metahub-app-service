import { useMemo } from 'react';
import { createImageUpload } from 'novel';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export function useImageUpload() {
  const { toast } = useToast();

  const uploadFn = useMemo(() => createImageUpload({
    validateFn: (file) => {
      if (!file.type.startsWith('image/')) {
        toast({
          title: '不支持的文件类型',
          description: '请上传图片文件（jpg、png、gif、webp 等）',
          variant: 'destructive',
        });
        return false;
      }
      if (file.size > MAX_SIZE_BYTES) {
        toast({
          title: '文件过大',
          description: `图片大小不能超过 ${MAX_SIZE_MB}MB`,
          variant: 'destructive',
        });
        return false;
      }
      return true;
    },
    onUpload: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const { data } = await api.post<{ url: string }>(
        '/api/v1/knowledge/upload-image',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (!data?.url) {
        throw new Error('上传失败：未返回图片 URL');
      }

      return data.url;
    },
  }), [toast]);

  return uploadFn;
}
