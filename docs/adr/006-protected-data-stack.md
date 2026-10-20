# ADR-006: A protected data stack, with DynamoDB inside the free tier

- Status: Accepted
- Date: 2026-10-10

## Scenario

M2 adds the first user data: a DynamoDB table of measurements and a Cognito user pool of accounts. Until now there were two Terraform roots: `guardrails` (never destroyed) and `app` (destroyed and rebuilt freely).

## Obstacle

1. **`terraform destroy` on the app would delete user data.** Photos are never stored ([ADR-002](002-pose-extraction-in-browser.md)), so a deleted measurement history can't be rebuilt.
2. **User accounts are data too.** Each measurement is keyed by the user's Cognito `sub`. Recreating the user pool issues everyone a new `sub`, so even a surviving table would hold history nobody can reach.
3. **"DynamoDB on-demand" isn't free.** AWS's always-free tier for DynamoDB covers *provisioned* capacity (25 read and 25 write units) and 25 GB of storage. On-demand requests are billed from the first one ($0.625 per million writes, $0.125 per million reads). At LiftLens's scale that rounds to $0.00, but it isn't guaranteed: a flood of requests would be billed.

## Action

A third Terraform root, `infra/data/`, holds the measurement table and the user pool (with its app client). The app stack looks them up by name. Both resources also have AWS-level deletion protection, which refuses deletion from Terraform or the console until it's switched off.

The table uses provisioned capacity of 5 reads and 5 writes per second, well inside the always-free 25/25, on the Standard table class (the only one the free tier covers). Requests above capacity are throttled rather than billed, and the API returns 503 "busy, try again".

Other settings: encryption with the AWS owned key (no charge); point-in-time recovery off (continuous backups are billed per GB); Cognito on the Lite tier (10,000 monthly active users free), email sign-in with a verified email, and Cognito's built-in email sender (free, up to 50 emails a day).

Alternatives considered:

- **Deletion protection only, table and pool in the app stack.** Protects against the console too, but `terraform destroy` on the app then fails partway, which makes cleaning up experiments awkward.
- **A separate stack without deletion protection.** Protects against Terraform, but not against a mistake in the console.
- **On-demand capacity.** Scales without throttling and costs fractions of a cent here, but isn't guaranteed $0 and has no ceiling.

## Result

- `terraform destroy` on the app stack can't reach user data, and neither the table nor the user pool can be deleted without first switching protection off.
- The table is guaranteed $0 and acts as a second cost cap alongside the API's reserved concurrency.
- The project rule "DynamoDB on-demand" was changed to "provisioned within the free tier".
- There are three roots to apply instead of two, and the app stack needs the data stack to exist first.

## Troubleshooting

- **Found by checking prices before adding the resource.** The project rule is to state each resource's free-tier limit before adding it. Checking DynamoDB's pricing page showed that on-demand requests aren't part of the free tier, which the original plan had assumed.
- **The user pool almost went in the app stack.** The first design protected only the table. Tracing what `userId` actually is (the Cognito `sub`) showed that recreating the pool would orphan every user's history, so the pool moved into the data stack as well.
- **The app plan can't run before the data stack exists.** The app stack reads the table and user pool by name, so its plan fails until they're created. Apply `data` first, then plan and apply `app`.
