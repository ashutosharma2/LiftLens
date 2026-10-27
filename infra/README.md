# Infrastructure

## Scenario

All LiftLens infrastructure is Terraform ([ADR-001](../docs/adr/001-serverless-terraform.md)). The account has no spending cap, so cost guardrails must exist before anything else and must keep working whatever happens to the app.

## Obstacle

- Experimental resources are destroyed often. With everything in one Terraform root, one `terraform destroy` (or one broken app change that fails the whole plan) would take the guardrails with it.
- `prevent_destroy` doesn't solve this: it makes the whole `destroy` fail rather than skipping the protected resources.
- The guardrails need to act on app resources they don't manage.
- User data (measurements and the accounts they belong to) must survive anything done to the app.

## Action

Three Terraform roots, each with its own state:

| Root | Manages | Lifecycle | Applied as |
|---|---|---|---|
| `guardrails/` | Budget, budget action, deploy role, alert topic, kill switch | Long-lived; never destroyed with the app | SSO admin (`liftlens` profile), so it stays fixable while the deploy role is locked |
| `data/` | Measurement table, Cognito user pool and app client | Long-lived; deletion protection on both ([ADR-006](../docs/adr/006-protected-data-stack.md)) | `liftlens-deploy` role |
| `app/` | API Lambda, Function URL, logs and role, via `modules/api` | Can be destroyed and recreated freely | `liftlens-deploy` role, which the budget action can lock |

- Every resource gets default tags `Project`, `ManagedBy` and `Stack`. Because the roots don't share state, the kill switch finds app resources by tag (`Project=LiftLens`, `Stack=app`), so it can never stop itself.
- No AWS profile is named in the code; credentials come from the environment (`AWS_PROFILE` locally, OIDC in CI).
- Provider versions are pinned exactly, and the lock files are committed.

## Result

- The guardrails stack is deployed (15 resources) and was tested end to end: a direct invoke of the kill switch, then a message through SNS that triggered it automatically.
- The app stack can be destroyed and rebuilt without touching cost protection or user data.
- The data stack (3 resources) and app stack (7 resources) are deployed and smoke-tested: sign-up, email confirmation, a saved measurement and the history read back.

## Troubleshooting

- **Expired sign-in during apply.** `Error: No valid credential sources found` means the 4-hour SSO session expired. Run `aws sso login --profile liftlens` and retry.
- **"Saved plan is stale".** A failed apply can still write state (for example, lookups only), which invalidates a saved plan. Check the state with `terraform state list`, run `plan` again, review it, then apply the new plan.
- **No reserved concurrency (fixed).** The account's original Lambda limit of 10 allowed none ([ADR-003](../docs/adr/003-lambda-concurrency-exception.md)); after it was raised (to 400 on 2026-10-10, then 1,000 on 2026-10-15), the kill switch and API each reserve 2.
- **The app plan fails with "no matching table" or similar.** The app stack reads the table and user pool created by `data/`; apply `data/` first.

## Reference: running Terraform

```sh
aws sso login --profile liftlens
export AWS_PROFILE=liftlens

cd infra/guardrails   # or infra/data, infra/app with AWS_PROFILE=liftlens-deploy
terraform init
terraform plan -out=plan.tfplan   # review every resource
terraform apply plan.tfplan
```

The guardrails root needs `alert_email` in a gitignored `terraform.tfvars`. State is local for now (gitignored) and moves to an S3 backend in M5.
