import { Gauge, Sparkles } from 'lucide-react';
import type { MessagePart } from '@/lib/api';
import { parseMetricsContent } from '@/lib/api';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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
  return `${value.toLocaleString()}${source === 'estimated' ? ' (Est.)' : ''}`;
}

function formatThroughput(value: number | null): string {
  if (value == null) return '--';
  return `${value.toFixed(2)} tok/s`;
}

function formatCompactThroughput(value: number | null): string {
  if (value == null) return '--';
  return `${value.toFixed(0)}/s`;
}

export function MetricsPart({ part }: MetricsPartProps) {
  const metrics = parseMetricsContent(part);
  if (!metrics) return null;

  const isEstimated =
    metrics.input_token_source === 'estimated' ||
    metrics.output_token_source === 'estimated' ||
    metrics.total_token_source === 'estimated';
  const compactTokenValue =
    metrics.total_tokens ?? metrics.output_tokens ?? metrics.input_tokens;

  return (
    <div className="my-1">
      <TooltipProvider delayDuration={300} skipDelayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-sky-500/25 hover:bg-muted/55 hover:text-foreground"
            >
              <Gauge className="h-3 w-3" />
              <span className="font-medium">{isEstimated ? 'perf~' : 'perf'}</span>
              <span>ft {formatLatency(metrics.first_token_latency_ms)}</span>
              <span>tok {compactTokenValue ?? '--'}</span>
              <span>tps {formatCompactThroughput(metrics.output_tokens_per_second)}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="start"
            sideOffset={6}
            className="w-[320px] overflow-hidden rounded-2xl border border-sky-500/10 bg-background/92 p-0 shadow-[0_12px_40px_rgba(15,23,42,0.16)] backdrop-blur-md"
          >
            <div className="flex items-center justify-between border-b border-border/50 bg-sky-500/[0.04] px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-foreground">
                <Gauge className="h-3.5 w-3.5 text-sky-600" />
                Perf
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isEstimated ? '~ estimated' : 'reported'}
              </div>
            </div>
            <div className="space-y-2 px-3 py-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-muted/35 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">First</div>
                  <div className="mt-0.5 text-sm font-medium text-foreground">
                    {formatLatency(metrics.first_token_latency_ms)}
                  </div>
                </div>
                <div className="rounded-xl bg-muted/35 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">TPS</div>
                  <div className="mt-0.5 text-sm font-medium text-foreground">
                    {formatCompactThroughput(metrics.output_tokens_per_second)}
                  </div>
                </div>
                <div className="rounded-xl bg-muted/35 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Tokens</div>
                  <div className="mt-0.5 text-sm font-medium text-foreground">
                    {compactTokenValue?.toLocaleString() ?? '--'}
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
                  <Sparkles className="h-3 w-3" />
                  Details
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                  <span>Completion</span>
                  <span className="text-foreground">{formatLatency(metrics.completion_duration_ms)}</span>
                  <span>Total</span>
                  <span className="text-foreground">{formatLatency(metrics.total_duration_ms)}</span>
                  <span>Input</span>
                  <span className="text-foreground">{formatTokenCount(metrics.input_tokens, metrics.input_token_source)}</span>
                  <span>Output</span>
                  <span className="text-foreground">{formatTokenCount(metrics.output_tokens, metrics.output_token_source)}</span>
                  <span>TPS</span>
                  <span className="text-foreground">{formatThroughput(metrics.output_tokens_per_second)}</span>
                </div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
