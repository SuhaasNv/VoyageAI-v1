| Scenario | Users | Samples | Avg Latency (ms) | P95 (ms) | Throughput (req/s) | Error Rate | APDEX (T=500ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Baseline (10u,2m) | 10 | 80 | 14405.0 | 108097.0 | 1.21 | 1.25% | 0.625 |
| Normal load (50u,5m) | 50 | 973 | 13710.7 | 116348.0 | 3.24 | 0.51% | 0.635 |
| Stress (100u,5m) | 100 | 1848 | 14139.6 | 116375.0 | 6.18 | 0.97% | 0.610 |

| Endpoint | Avg (ms) | P95 (ms) | Throughput (req/s) | Error % | Samples |
|---|---:|---:|---:|---:|---:|
| POST /api/ai/itinerary-flow/research | 118565.3 | 161185.0 | 0.44 | 2.50% | 320 |
| POST /api/ai/itinerary-flow/logistics | 4907.6 | 6378.0 | 0.27 | 0.00% | 192 |
| POST /api/ai/itinerary-flow/planner | 2308.4 | 3630.0 | 0.45 | 4.55% | 330 |
| GET /api/trips | 785.0 | 2027.0 | 0.45 | 0.00% | 332 |
| GET /dashboard | 747.8 | 2123.0 | 0.46 | 0.29% | 340 |
| GET /dashboard-0 | 653.6 | 2007.0 | 0.46 | 0.00% | 339 |
| GET /api/health | 455.5 | 1831.0 | 0.46 | 0.00% | 341 |
| POST /api/ai/itinerary-flow/safety | 168.5 | 802.0 | 0.26 | 0.00% | 182 |
| POST /api/ai/itinerary-flow/budget | 123.3 | 163.0 | 0.27 | 0.00% | 186 |
| GET /dashboard-1 | 96.0 | 197.0 | 0.46 | 0.00% | 339 |

Failed codes: 429:15, Non HTTP response code: java.net.SocketTimeoutException:6, Non HTTP response code: org.apache.http.NoHttpResponseException:2, 502:1
