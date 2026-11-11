/**
 * Prometheus-style metrics registry (hand-rolled, no extra deps).
 * Exposed at GET /metrics in Prometheus text exposition format.
 */
import { performance } from 'node:perf_hooks';

interface CounterEntry {
  labels: string[];
  value: number;
}

export class Metrics {
  private readonly start = performance.now();
  private readonly requestTotal: CounterEntry[] = [];
  private readonly latencySum = new Map<string, { sum: number; count: number }>();
  private readonly requestLabels = new Map<string, number>();

  /** Record one request completion. */
  recordRequest(route: string, statusCode: number, latencyMs: number): void {
    this.inc('request_total', [route, String(statusCode)]);
    const key = route;
    const cur = this.latencySum.get(key) ?? { sum: 0, count: 0 };
    cur.sum += latencyMs;
    cur.count += 1;
    this.latencySum.set(key, cur);
  }

  private inc(name: string, labels: string[]): void {
    const key = `${name}{${labels.join(',')}}`;
    this.requestLabels.set(key, (this.requestLabels.get(key) ?? 0) + 1);
  }

  /** Render Prometheus text format. */
  render(): string {
    const lines: string[] = [];
    lines.push('# HELP api_website_request_total Total processed requests');
    lines.push('# TYPE api_website_request_total counter');
    for (const [key, value] of this.requestLabels) {
      lines.push(`api_website_request_total${key.slice(key.indexOf('{'))} ${value}`);
    }
    lines.push('# HELP api_website_request_latency_seconds Request latency (avg, seconds)');
    lines.push('# TYPE api_website_request_latency_seconds gauge');
    for (const [route, { sum, count }] of this.latencySum) {
      if (count === 0) continue;
      lines.push(
        `api_website_request_latency_seconds{route="${route}"} ${(sum / count / 1000).toFixed(4)}`
      );
    }
    lines.push('# HELP api_website_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE api_website_uptime_seconds counter');
    lines.push(`api_website_uptime_seconds ${((performance.now() - this.start) / 1000).toFixed(1)}`);
    return lines.join('\n') + '\n';
  }
}