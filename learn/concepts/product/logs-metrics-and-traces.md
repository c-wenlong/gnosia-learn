---
id: logs-metrics-and-traces
title: Logs, metrics and traces
summary: "The three kinds of telemetry: logs record events, metrics aggregate numbers for cheap alerting, traces follow one request across services, joined by correlation ids."
requires: []
tags: [product]
sources: []
created: 2026-09-28T15:33:55.657Z
---

# Logs, metrics and traces

Telemetry is the data a running system emits about itself, and it comes in three main kinds. Logs record discrete events, metrics are numbers aggregated over time, and traces follow one request across every service it touches. Each answers a different question, so production systems usually need all three.

## Why it matters

When a user says "it's broken", a team without telemetry is guessing. A small team cannot watch dashboards all day, so it needs alerts when users are hurting, and detail afterwards to find out why.

## The idea

| Kind | What it is | Question it answers |
| --- | --- | --- |
| Log | A timestamped record of one event | What exactly happened here? |
| Metric | A counter, gauge or histogram over time | How often, how much, is it worsening? |
| Trace | A tree of timed spans for one request | Where did the time go, which hop failed? |

**Logs** should be structured, as key-value fields like `level=error route=/checkout` rather than free sentences, so you can filter and count them. Their volume and cost grow with traffic.

**Metrics** are cheap because each series stores a few numbers per time step whatever the traffic, which makes them the right basis for alerts. The catch is labels: every distinct label value creates a new series, so a label like user id makes storage explode.

**Traces** are made of spans. Each span is one timed operation (a handler, a database query, an LLM call) that records its parent.

**Correlation ids** tie them together. An id created where the request enters is passed to every downstream call and stamped on every log line.

**Alert on symptoms**, what users feel (error rate, slow responses), not causes such as high CPU. High CPU may hurt nobody; a broken dependency may not raise CPU at all.

OpenTelemetry is a common vendor-neutral standard for producing all three.

CS3216 (Software Product Engineering for Digital Markets) places this under its Full-Stack Product Engineering module.

## Worked example

An alert fires: errors on `POST /checkout` have been above 5% for five minutes. That metric says something is wrong. The team opens a failed trace from that window. Its spans show the handler took 30.1 seconds, of which 30 seconds was one span calling the payment provider, ending in a timeout. That says where. Filtering logs by the trace's id finds `payment_timeout after_ms=30000 orderId=812`, which says what. The fix: a shorter timeout and a clear message to the user.

## Failure modes

- **Free-text logs.** Answering "how many?" means grepping by hand.
- **Secrets or personal data in logs.** Logs are widely readable and kept long.
- **Alerting on causes.** Pages for harmless CPU spikes train the team to ignore alerts.
- **High-cardinality labels.** A user id as a metric label multiplies series and cost.
- **No correlation id.** Logs from different services cannot be joined for one request.

## Checks

```check
q: You want to be paged when checkout is failing for users. Should the alert be built on logs, metrics or traces, and on what signal?
a: A metric, such as the checkout error rate or latency staying above a threshold for a few minutes. Metrics are cheap to evaluate continuously and measure the symptom users feel.
why: Catches alerting on individual log lines or on causes such as CPU.
```

```check
q: One request is slow and passes through a web server, an API and a database. Which kind of telemetry shows which hop took the time?
a: A trace. Its spans time each hop and link them as one request, so the slow span stands out; logs and metrics describe events or aggregates without that per-request structure.
why: Catches confusing traces with logs that happen to mention the same request.
```

```check
q: Why is it a bad idea to add user id as a label on a request-count metric?
a: Each distinct label value creates a separate time series, so millions of users means millions of series and exploding storage and cost. Per-user detail belongs in logs or traces.
why: Catches treating metrics as if they were as free-form as logs.
```
