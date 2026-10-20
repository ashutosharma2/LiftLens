# ADR-001: Serverless on AWS, managed with Terraform

- Status: Accepted
- Date: 2026-10-06

## Scenario

LiftLens must cost $0 a month. The AWS account is on the Paid plan, which has no automatic spending cap, so anything that bills will bill. It's also a learning build, so every resource has to be something I can explain.

## Obstacle

The original design in `docs/` was a conventional web stack, and almost every piece of it runs all day and night:

| Piece | What it needs on AWS |
|---|---|
| FastAPI backend | A server running 24/7 (EC2 or Fargate) |
| PostgreSQL | An RDS instance running 24/7 |
| Redis + Celery workers | ElastiCache plus always-on workers |
| Photo uploads | S3 plus an upload and processing pipeline |
| API Gateway / Nginx | API Gateway or a load balancer |

These bill by the hour whether anyone uses the app or not. Even the smallest database instance breaks a $0 budget in its first month.

## Action

Go serverless, using only services that bill per use and stay inside AWS's always-free allowances:

- API: one Python Lambda behind a Lambda Function URL.
- Data: DynamoDB on-demand, keyed by `userId` + `timestamp`.
- Web: S3 + CloudFront.
- Auth: Cognito.

Manage it with Terraform. The main reason is that `terraform plan` shows exactly what will be created, changed or destroyed before anything happens, and nothing gets applied until that plan has been reviewed. Terraform also means:

- `terraform destroy` removes exactly what a root created, so experiments don't leave forgotten resources behind.
- The infrastructure is code in Git, with history and review.
- CI can run the same plan and apply later.

Alternatives considered:

- **FastAPI + PostgreSQL (the original design).** Familiar and flexible, but its always-on pieces cost money every hour.
- **Building in the console instead of Terraform.** Faster for a first try, but there's no review step before changes, no history, and cleanup depends on memory.

## Result

This gets $0 a month at portfolio scale, nothing to patch or keep running, and infrastructure that is reviewed before it changes and can be torn down cleanly.

The costs:

- **SQL-style queries.** DynamoDB looks items up by key; ad-hoc queries across users ("average ratio per month for September sign-ups") are hard. V1 only needs one user's history, newest first, which the `userId` + `timestamp` key serves directly. Accepted as worth it for $0.
- **Cold starts.** A Lambda that hasn't run recently takes up to about a second to answer its first request.
- **Local development.** There is no single `uvicorn main:app` equivalent; handlers are tested as plain Python functions, and the full path is tested in AWS.
- **AWS lock-in.** Lambda, DynamoDB and Cognito don't move to another provider without rework.

Revisit when V2 needs cross-user analytics or reporting (consider a SQL store or an export to S3 + Athena), or work appears that runs longer than a Lambda allows.

## Troubleshooting

- **Stale documentation.** After this decision, `docs/` still described the FastAPI/PostgreSQL design, which could mislead readers. Each of those files now opens with a "Superseded" banner pointing to the README; they get rewritten or removed in M6.
- **Plan review caught a stale plan.** The first real `apply` failed on an expired sign-in and left a lookup-only state file, so Terraform refused the reviewed plan as stale. Re-planning, checking the new plan was identical and approving it again is the same review step this decision depends on (see [the project story](../project-story.md#t-troubleshooting)).
