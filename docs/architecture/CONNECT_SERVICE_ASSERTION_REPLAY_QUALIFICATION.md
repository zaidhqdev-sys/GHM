# Connect Service Assertion Replay Protection Qualification

**CONSTRUCTION QUALIFIED — ASSERTION REPLAY-PROTECTION SUB-SLICE ONLY**

This slice adds durable, atomic consumption of the verified Connect service assertion `jti`.

- PostgreSQL uniqueness on `jti` makes consumption atomic under concurrency.
- Runtime receives only EXECUTE on a SECURITY DEFINER consume function.
- Runtime has no direct table mutation grant.
- Expired replay records are removed during consumption.
- This is not an audit log.
- Cryptographic verification remains owned by the service assertion verifier.

This slice does not expose mutation HTTP operations, issue credentials, rotate credentials, migrate sessions, or perform production cutover.

A future service boundary may consume the verified assertion before executing a request. Business mutation idempotency remains a separate concern.
