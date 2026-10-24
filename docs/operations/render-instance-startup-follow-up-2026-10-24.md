# Render Instance Startup Follow-up — 2026-10-24

Supplement to the production DB and Render handover:
https://github.com/zaidhqdev-sys/GHM/blob/main/docs/operations/handover-production-db-and-render-2026-10-24.md

## New evidence from Render logs and metrics

A detailed read-only query of application logs and per-instance metrics was performed for 2026-10-24 00:00–01:10 UTC.

- The 00:26 deployment started `npm start` on instance `srv-damupsek1f9s73eq8kkg-b9cdl` at 00:26:15 UTC and logged `GHM Core Engine listening on port 10000` at 00:26:19 UTC.
- A later `npm start` occurred on a **different instance**, `srv-damupsek1f9s73eq8kkg-6vqht`, at 00:54:31 UTC; it logged `GHM Core Engine listening on port 10000` at 00:54:35 UTC.
- Therefore the 00:54 log is not merely a second start line on the same instance ID: Render's log labels show a different instance. This supports that a new/replacement instance was started at some point after the 00:26 deployment.
- The queried 00:00–01:00 app logs contain the 00:26 and 00:54 startup sequences, Render's port-detected messages, and no log text matching `error`, `killed`, `SIGTERM`, `SIGKILL`, `restart`, `shutdown`, `out of memory`, or `exited`.
- Per-instance CPU and memory metrics are present for the two instances around their respective startup periods. The queried instance-count metric returned no data, so it cannot establish the exact instance-count transition or reason.
- Render service events still show the successful 00:26 deployment but no corresponding `server_restarted`, `server_failed`, or hardware-failure event explaining the later replacement.

## Conclusion

**New instance/replacement is supported by the distinct instance IDs; the reason for it is still not exposed by the queried logs or events.** There is no positive evidence in these records of an out-of-memory kill or application crash, but absence of a matching log/event is not proof that no platform-side event occurred.

The user directly checked `https://ghm-internal-runtime.onrender.com/healthz` at 2026-10-24 13:56:53 UTC and reported `{"status":"ok"}`. The runtime was therefore reachable and returning OK at that time.

## Safe next action

If determining the replacement cause remains important, inspect Render dashboard instance/lifecycle details or ask Render support to identify why instance `srv-damupsek1f9s73eq8kkg-b9cdl` was replaced by `srv-damupsek1f9s73eq8kkg-6vqht`. Do not infer the trigger from the start logs alone. No restart, redeploy, credential change, database change, or migration was performed during this investigation.
