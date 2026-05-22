/**
 * Observability abstraction for the ingestion governance platform.
 *
 * This module provides a pluggable adapter interface for exporting
 * ingestion metrics, events, and alerts to external observability
 * backends. The default adapter is a no-op.
 *
 * Integration points:
 *   - OpenTelemetry:  implement ObservabilityAdapter using @opentelemetry/api
 *   - Prometheus:     implement via prom-client push metrics
 *   - Grafana Agent:  implement via OTLP exporter pointing at Grafana Cloud
 *   - Datadog:        implement via dd-trace MetricsClient
 *
 * Usage in production:
 *   import { setObservabilityAdapter } from "@/lib/ingestion/observability";
 *   import { datadogAdapter } from "@/lib/observability/datadog";
 *   setObservabilityAdapter(datadogAdapter);
 */

export type MetricTags = Record<string, string | number | boolean>;

export type ObservabilityAlert = {
  level: "info" | "warning" | "critical";
  event: string;
  threshold: number;
  actual: number;
  timestamp: string;
};

/**
 * Adapter interface for integrating with external observability backends.
 * Implement all methods or use partial adapter composition as needed.
 */
export interface ObservabilityAdapter {
  /**
   * Record a numeric metric (counter, gauge, or histogram value).
   * @param name   Metric name, e.g. "ingestion.pipeline_success_rate"
   * @param value  Numeric value
   * @param tags   Optional dimensional tags
   */
  recordMetric(name: string, value: number, tags?: MetricTags): void;

  /**
   * Record a discrete event (e.g. batch imported, record rejected).
   * @param name        Event name, e.g. "ingestion.batch_reconciled"
   * @param attributes  Optional key-value attributes
   */
  recordEvent(name: string, attributes?: MetricTags): void;

  /**
   * Forward an active anomaly alert to the observability backend.
   * CRITICAL alerts should be routed to PagerDuty / on-call channels.
   */
  recordAlert(alert: ObservabilityAlert): void;
}

const noopAdapter: ObservabilityAdapter = {
  recordMetric: () => {},
  recordEvent: () => {},
  recordAlert: () => {},
};

let activeAdapter: ObservabilityAdapter = noopAdapter;

/** Replace the default no-op adapter with a real observability backend. */
export function setObservabilityAdapter(adapter: ObservabilityAdapter): void {
  activeAdapter = adapter;
}

/** Return the currently registered adapter (no-op by default). */
export function getObservabilityAdapter(): ObservabilityAdapter {
  return activeAdapter;
}

/** Reset to the no-op adapter (useful in tests). */
export function resetObservabilityAdapter(): void {
  activeAdapter = noopAdapter;
}

/** Convenience wrapper — records a metric on the active adapter. */
export function recordMetric(name: string, value: number, tags?: MetricTags): void {
  activeAdapter.recordMetric(name, value, tags);
}

/** Convenience wrapper — records an event on the active adapter. */
export function recordEvent(name: string, attributes?: MetricTags): void {
  activeAdapter.recordEvent(name, attributes);
}

/** Convenience wrapper — forwards an alert to the active adapter. */
export function recordAlert(alert: ObservabilityAlert): void {
  activeAdapter.recordAlert(alert);
}
