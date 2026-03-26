import { Activity, Gauge, Timer } from 'lucide-react';
import type { MessagePart } from '@/lib/api';
import { parseMetricsContent } from '@/lib/api';

interface MetricsPartProps {
  part: MessagePart;
}

function formatLatency(value: number | null): string {
  if (value == null) return '--';
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

function formatTokenCount(
  value: number | null,
  source: 'reported' | 'estimated' | 'unavailable',
): string {
  if (value == null || source === 'unavailable') return '--';
  return `${value.toLocaleString()}${source === 'estimated' ? ' (Estimated)' : ''}`;
}

function formatThroughput(value: number | null): string {
  if (value == null) return '--';
  return `${value.toFixed(2)} tok/s`;
}

export function MetricsPart({ part }: MetricsPartProps) {
  const metrics = parseMetricsContent(part);
  if (!metrics) return null;

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-sky-500/20 bg-sky-500/5">
      <div className="flex items-center gap-2 border-b border-sky-500/10 px-3 py-2">
        <Gauge className="h-4 w-4 text-sky-600" />
        <div className="text-sm font-medium text-sky-900 dark:text-sky-100">Performance</div>
      </div>
      <div className="grid gap-2 px-3 py-3 sm:grid-cols-2">
        <div className="rounded-md bg-background/70 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Timer className="h-3 w-3" />
            Latency
          </div>
          <div className="text-sm">First token: {formatLatency(metrics.first_token_latency_ms)}</div>
          <div className="text-sm">Completion: {formatLatency(metrics.completion_duration_ms)}</div>
          <div className="text-sm">Total: {formatLatency(metrics.total_duration_ms)}</div>
        </div>
        <div className="rounded-md bg-background/70 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3 w-3" />
            Tokens
          </div>
          <div className="text-sm">Input: {formatTokenCount(metrics.input_tokens, metrics.input_token_source)}</div>
          <div className="text-sm">Output: {formatTokenCount(metrics.output_tokens, metrics.output_token_source)}</div>
          <div className="text-sm">Total: {formatTokenCount(metrics.total_tokens, metrics.total_token_source)}</div>
          <div className="text-sm">TPS: {formatThroughput(metrics.output_tokens_per_second)}</div>
        </div>
      </div>
    </div>
  );
}
