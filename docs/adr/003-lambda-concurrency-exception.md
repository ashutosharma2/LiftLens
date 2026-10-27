# ADR-003: No reserved concurrency until the account quota is raised

- Status: Superseded on 2026-10-10 (the account limit was raised; see Result)
- Date: 2026-10-05

## Scenario

The project rule is that every Lambda sets reserved concurrency (default 2), so no single function can run away and the kill switch always has capacity to run.

## Obstacle

This account's Lambda quota is 10 concurrent executions, and AWS requires at least 10 to stay unreserved. So with a quota of 10, no function can reserve any concurrency, and setting it fails. (Setting a function to 0, which is what the kill switch does, is still allowed.)

What the low quota means:

- The whole account can run at most 10 Lambda invocations at once. Extra requests are throttled, not queued, and throttled requests cost nothing.
- All functions share those 10 slots. A flood of API traffic could briefly crowd out the kill switch.

## Action

1. Request a quota increase to 1,000 concurrent executions (Service Quotas, free).
2. Until it's approved, deploy Lambdas without reserved concurrency, and let the account quota of 10 act as the cap.
3. When the increase is approved, give every Lambda reserved concurrency (kill switch and API at 2) and mark this ADR superseded.

Alternatives considered:

- **Wait for the quota increase before building.** Safest, but approval can take days and may be refused for new accounts.
- **Build without reservations and leave it.** Leaves the kill switch exposed to being crowded out, with no plan to fix it.

## Result

- Guardrails were deployed and tested on schedule.
- The quota of 10 acts as a free account-wide cap on Lambda spend in the meantime.
- Residual risk: the kill switch could be delayed (not lost) under heavy API traffic. SNS delivers to Lambda asynchronously and Lambda retries throttled async events.
- Follow-up tracked in BACKLOG.md.

**Update, 2026-10-10:** the account limit was raised to 400 (the request for 1,000 is still open). Reserved concurrency is now set: kill switch 2, API 2. With the account limit no longer acting as a cap, the API's reservation of 2 is what limits how fast a flood of requests can spend.

**Update, 2026-10-15:** AWS approved the original request, so the limit is now 1,000. Nothing in Terraform changes: each function still reserves 2, and the API's reservation is still what caps spend.

## Troubleshooting

- **How it was found.** Before writing the kill switch, a read-only `aws lambda get-account-settings` check returned `ConcurrentExecutions: 10` and `UnreservedConcurrentExecutions: 10`. Checking the quota first avoided a failed `terraform apply` on the reserved-concurrency setting.
- **Lesson:** check account quotas before designing around a limit that new accounts may not have.
