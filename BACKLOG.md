# Backlog (ideas parked so they don't hijack a session)

## M0 guardrails (must finish before any deploy)
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
- [x] Calibrate the scoring noise threshold: 10 repeat front photos, 2x the gap SD -> ±2.4% (docs/scoring.md)
- [ ] Arms against the sides merge with the torso in the mask, so the waist is measured edge of arm to edge of arm (seen: ratio 0.74, offered Save; the server rejects < 0.8). Decide how the browser detects it (retake, per "retake what's meaningless") and check the 0.8-3.0 range before offering Save
- [ ] The outline model (selfie_segmenter, built for close-up video calls) merges dark furniture touching the body into the person in a cluttered room at distance (seen 2026-10-15: chair and bedding painted as person, ratios 1.06 and 0.80 vs 1.78 against a plain wall). Decide how the browser detects a bad outline (e.g. waist edges reaching the wrist landmarks) and whether the setup tips need "plain wall behind you"; a sideways (landscape) photo was also accepted without a warning
- [ ] Back photos as a feature (decided 2026-10-15): front and back each get their own baseline and are never compared, like method versions (ADR-007). Still to decide: how the app knows the view (user picks or detected from the face landmarks), where the waist is measured from behind, and a separate noise calibration for back photos. Until then a back photo is treated as a front one
- [ ] Too close? A distance simulation (2026-10-16, shrinking front1/front2 inside a plain canvas) found no drift from distance down to 14% shoulder share, but both unpadded originals, where the body runs into the frame edges, read 3-5% lower than every padded copy. Test with real photos: one with the body touching the frame edges, one with space around it
- [ ] Side-on photos have no check of their own: a side-on mirror selfie (2026-10-17) was rejected only because the far arm was hidden ("your arms aren't fully in the photo... step back"), so the message gives the wrong fix. Detect side-on (shoulder joints close together relative to torso length, one arm unseen) and say "face the camera"
- [ ] Flexed poses pass when the upper arms are in range: a front flex with fists together at the waistband (2026-10-17) read 1.76, close to relaxed photos in the same room (1.71-1.77), so no check yet. If a harder flex (lat spread) distorts the outline, catch it with forearm direction (relaxed: hanging down; flexed: pointing inward)
- [ ] Waist row at 55% instead of 65% (2026-10-17): on 11 repeat photos the ratio's SD fell from 3.58% to 1.13% (65% sits on the shorts' waistband; at 55% the waist and shoulder outlines move together with arm angle and cancel). Picked as the best of six heights on the same photos, so validate on a fresh session with dev/compare_waist_rows.py before changing the method
- [x] When the Lambda concurrency quota increase is approved: add reserved concurrency (kill switch, API) and close the ADR exception
- [ ] ADR (later): move the app into a separate member AWS account (SCPs apply there; keeps management account empty)
- [x] ADR-002: pose extraction in browser (MediaPipe JS) vs container-image Lambda
- [ ] Update docs/ to the serverless architecture
- [ ] With M4: plan and apply in CI through OIDC (Terraform state in S3, a CI role the budget action also locks, apply only after my approval in a protected environment). Decide two things first: how much of a plan to print, since Actions logs on a public repo are public and ARNs include the account ID, and the cost of the state bucket, since S3 has no permanent free tier on this account
- [ ] M5: replace the AdministratorAccess permission set with a custom least-privilege set built from the actions Terraform actually used (CloudTrail)
- [ ] Find end-sem exam dates and shift milestones
- [ ] Measure more muscle groups on the body map (later version); needs a method that's reliable from photos before anything is shown
