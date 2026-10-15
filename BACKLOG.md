# Backlog (ideas parked so they don't hijack a session)

## M0 — guardrails (must finish before any deploy)
- [x] M0.2 IAM Identity Center user + `aws configure sso`; verify `aws sts get-caller-identity`
- [x] M0.3 infra/ skeleton: versions.tf, providers.tf, main.tf; local state; .gitignore checked
- [x] M0.4 Budget Action in Terraform: at $1 actual, attach deny-all policy to build user + CI role
- [x] M0.5 Kill-switch Lambda: on budget SNS alert -> Lambda reserved concurrency 0 + disable CloudFront
- [x] M0.6 ADR-001: Serverless + Terraform (vs FastAPI/Postgres and vs the CDK scaffold)

## Later
- [ ] M4: serve the MediaPipe runtime and model files from S3 + CloudFront (copy-models.sh only covers local dev)
- [ ] After M3: system-design doc (non-functional requirements decided by Ashu, capacity check, failure modes, threat model, accepted risks) + free CloudWatch alarms on API errors and throttling
- [ ] M3: once the browser signs in with SRP, decide whether to keep USER_PASSWORD_AUTH on the app client (currently there for CLI smoke tests)
- [ ] Consider lowering the API Lambda to 128 MB (peak use 110 MB) after M3 load is known
- [ ] Steadier ruler for the indexes (combine joints and torso length, or median of 3 photos); recompute history from stored pixel ingredients
- [ ] Calibrate the scoring noise threshold: ~5 front photos in one session, set NOISE_THRESHOLD to about 2x the spread (docs/scoring.md)
- [x] When the Lambda concurrency quota increase is approved: add reserved concurrency (kill switch, API) and close the ADR exception
- [ ] ADR (later): move the app into a separate member AWS account (SCPs apply there; keeps management account empty)
- [x] ADR-002: pose extraction in browser (MediaPipe JS) vs container-image Lambda
- [ ] Update docs/ to the serverless architecture
- [ ] M5: replace the AdministratorAccess permission set with a custom least-privilege set built from the actions Terraform actually used (CloudTrail)
- [ ] Find end-sem exam dates and shift milestones
- [ ] Measure more muscle groups on the body map (later version); needs a method that's reliable from photos before anything is shown
