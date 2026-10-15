# LiftLens: the project story (SOART)

Scenario, Obstacle, Action, Result, Troubleshooting. This is how LiftLens was planned and built, the decisions behind it, and what went wrong along the way. The detailed reasoning for each decision is in the [ADRs](adr/).

**Status:** in progress. Cost guardrails (M0), the measurement engine (M1), the backend (M2) and the browser app (M3) are done; hosting it on CloudFront (M4) is next.

---

## S: Scenario

**Gym-goers can't objectively track physique progress from photos.**

Progress photos are compared by eye. Lighting, camera distance, posture and memory all change from one week to the next, so it's hard to tell whether your shoulders actually got wider or the photo was just taken closer. Body-fat scales and tape measures exist, but none of them answer the question a lifter asks in the mirror: *is my shape changing?*

I wanted an app that turns a front-facing photo into a number you can track and check, with every result explained in plain English, and that I could run in public as a portfolio project.

Two personal constraints shaped everything:

- **It must cost $0/month.** My AWS account is on the Paid plan, which has no automatic spending cap. A single mistake (an always-on database, a NAT gateway) bills every hour until someone notices.
- **I'm new to AWS and Terraform.** I needed to be able to explain every resource and every permission, not just get something running.

## O: Obstacles

1. **No safety net on spending.** On a Paid-plan account, cost protection has to be built before anything else is deployed. Budget alerts alone only *notify*, hours late; they don't stop anything.
2. **The original design couldn't be free.** My first design (FastAPI, PostgreSQL, Redis, Celery workers) needs servers and a database running 24/7. Every one of them bills by the hour, whether anyone uses the app or not.
3. **Physique photos are extremely sensitive.** Storing people's body photos means being responsible for encrypting, securing and deleting them, and one mistake exposes strangers' images.
4. **A photo shows shape, not size.** Pixel widths change with camera distance, so "waist 640 px" means nothing, and comparing raw pixels between weeks is misleading.
5. **The prototype measured inconsistently.** My Python prototype measured shoulders between the shoulder *joints* but the waist between the body's *edges*, so its headline ratio compared two different kinds of measurement and couldn't show deltoid growth.
6. **The API runs on a device I don't control.** Anyone can edit requests in their browser's developer tools, so the server can't trust anything the browser claims, including who the user is.

## A: Actions

### 1. Built the cost guardrails before anything else

- Locked down the account: root MFA with a passkey, no root access keys, a $1 monthly budget with three alerts, and cost-anomaly alerts lowered from $100 to $1.
- Stopped using root day to day: set up **IAM Identity Center** so my terminal gets temporary credentials through browser sign-in, with no long-lived access keys on disk.
- Wrote a separate Terraform stack for the guardrails, kept apart from the app so that destroying the app can never remove them:
  - **Budget → SNS → kill-switch Lambda**, which finds app resources by tag, sets Lambda concurrency to 0 and disables CloudFront. It never touches stored data or itself.
  - **Budget action → deny-all policy on a dedicated `liftlens-deploy` role**, so automated deploys stop if spending passes $1.
  - Every permission least-privilege and explained; no wildcard actions in any *allow*.
- Reviewed every `terraform plan` before applying, and tested the kill switch for real: a direct invoke, then a message through SNS, which triggered it automatically.

### 2. Redesigned the architecture to be serverless ([ADR-001](adr/001-serverless-terraform.md))

I replaced the always-on stack with services that bill per use and fit AWS's always-free allowances: Lambda, DynamoDB on-demand, S3 + CloudFront and Cognito, all managed with Terraform. I accepted the trade-off: DynamoDB can't do ad-hoc SQL queries, but V1 only needs "one user's history, newest first".

### 3. Moved the measurement into the browser ([ADR-002](adr/002-pose-extraction-in-browser.md))

My first instinct was to run the pose model in a Lambda. When I weighed it properly, it would have meant storing users' body photos in AWS and paying for a container image every month. I chose to run MediaPipe **in the browser** instead: the photo never leaves the device, and the API only ever receives numbers.

- Split the code into `models.ts` (needs the ML models and a browser) and `maths.ts` (pure functions), so the maths can be unit-tested without a model. The waist function takes a single row of the body mask, not the photo.
- Proved the TypeScript port is faithful: a Python script runs the prototype on real photos and saves its inputs and results, and a parity test checks that the TypeScript gets the same numbers within 1%.

### 4. Fixed what the measurements actually mean ([ADR-004](adr/004-scale-free-measurements.md))

- **Both widths edge to edge.** Shoulders are now measured on the body outline like the waist, so building deltoids moves the number. To catch photos where raised arms join the outline, outer shoulder width is compared with joint width; on good photos it's 1.4–1.5×, and anything outside 1.1–1.8× is flagged.
- **No centimetres.** Ratios cancel pixels within a photo, so shoulder-to-waist is valid at any distance. For comparing widths across photos, I divide by hip-joint width, a bone measurement that doesn't change with training, so it acts as a ruler present in every photo.

### 5. Designed an honest, explainable score ([scoring](scoring.md))

- Tracked **one number**, shoulder-to-waist, because it was the only measurement that stayed steady across two photos of the same body, and it's the standard V-taper metric lifters already follow.
- Compared users **only with their own first photo**, never with an "ideal" body or with other users.
- Reported progress as a **percent change**, not invented points, so every result can be checked by hand, and treated changes under ±2% as noise.

### 6. Designed and built the API around a trust boundary ([API contract](api.md), [ADR-005](adr/005-store-ingredients-recompute-scores.md))

- The user ID comes **only from the verified sign-in token**, never from the request, so nobody can read or write another user's history.
- The server stamps the time and computes the ratio itself; the browser sends raw measurements only.
- Because the photo is gone after each check-in, every measurement stores the **raw per-photo values** too, so better formulas can be applied to past photos later. Scores are recomputed on every read, so a recalibrated threshold improves the whole history at once.
- Token verification uses a standard library (PyJWT) against Cognito's public keys, cached between requests, with no network call per request.
- Everything that talks to the outside world (keys, clock, database) sits behind small interfaces, so tests run the real logic with fakes.

### 7. Deployed the backend with user data protected ([ADR-006](adr/006-protected-data-stack.md))

- Put the measurement table **and the user pool** in their own Terraform stack with deletion protection, so tearing down the app can never delete user data. The pool had to move too: each measurement is keyed by the user's Cognito ID, and recreating the pool would issue everyone a new one, orphaning their history.
- Chose **provisioned** DynamoDB capacity inside the free tier instead of on-demand: guaranteed $0, and requests over capacity are throttled rather than billed.
- Opened sign-up to anyone, but only with a **verified email**, so nobody can register an address they don't own.
- Kept the API's address public for now: the token check protects the data, and a reserved concurrency of 2 caps the cost of junk requests.
- Packaged the API's crypto library for Lambda's Linux on arm64, not for my Mac, and smoke-tested the live API: sign-up, email code, token, a saved measurement and the history read back.

### 8. Built the browser app around the user's flow

- Designed the app as **states** with clear ways in and out: sign in → history → guided capture → measuring → result → save. Returning users land on their history, not the camera.
- Built **my own sign-in screens** with Amplify Auth (SRP, so the password never leaves the browser), so sign-in matches the app's look.
- Designed capture for someone **alone**: the phone is propped up, a body outline and a 10-second countdown guide the pose so both arms are free for the shoulder check, with upload as a fallback. The camera turns off the moment the photo is taken.
- Made **Save a separate step**, so a bad first photo can't silently become the permanent baseline.
- Measured the photo **on the device**: the models start downloading as soon as the check-in screen opens, a scan line shows each step, and the shoulder and waist lines are drawn on the photo.
- Turned photo quality into one rule: **retake what's meaningless, flag what's suspicious.** Nobody found, a joint cut off or unclear, or no outline means the numbers would be meaningless, so only a retake is offered; arms in the shoulder outline give real but doubtful numbers, which can be saved flagged.
- Kept **all scoring on the server**: when "change since last check-in" was first built in the browser with its own copy of the noise rule, it moved into the API.

### 9. Documented as I went

Six ADRs, an API contract, a scoring document, 15 architecture diagrams that mark what's built and what's planned, and a README.

## R: Results

- **Built to run at $0/month** (the bill showed $0.00 at the last check), with automatic protection: if spending ever passes $1, the app stops and deploys are locked without anyone being awake. The kill switch was tested end to end and fires within about a second of the alert.
- **Photos never leave the device.** There are no stored images to secure, leak or delete, and no container image costs.
- **Measurements you can trust and check:**
  - The TypeScript engine matches the Python reference within 1% on real photos.
  - Two photos of the same body gave shoulder-to-waist ratios of **1.784 and 1.785**.
  - Every score shows its formula, its inputs and a one-sentence explanation.
- **Tested:** 73 TypeScript tests and 96 Python tests. The security tests include forged signatures, an edited user ID and expired tokens, and every validation rule in the API contract has a test.
- **Live backend:** a stranger can sign up with a verified email, save a measurement and read their history. The stored item holds exactly the ten designed fields: no photo, no email, no score. After the first (cold) request of about 1.5–2 seconds, requests take 1–19 ms.
- **The whole chain works in a real browser:** the same photo measured 1.785 in the Python reference and 1.78 in the browser. A second check-in from the same session was correctly reported as "no clear change", and the camera light goes off as soon as the photo is taken.
- **Decisions on record:** six ADRs, each with the alternatives I rejected and why.

## T: Troubleshooting

Each entry gives the problem, its root cause, the fix, and what I took away from it.

### Cost and AWS setup

**A default setting would have broken the $0 rule.**
- *Problem:* enabling IAM Identity Center preselected a "multi-Region" instance.
- *Cause:* multi-Region instances encrypt with a customer managed KMS key, about $1/month per key.
- *Fix:* chose a single-Region instance, then checked that encryption showed "AWS owned key" (free) before continuing.
- *Lesson:* read every default on a setup screen; cost hides in encryption and replication options.

**The cost alert threshold had a hidden second condition.**
- *Problem:* the anomaly alert was set to $1 but also required "AND 40% above expected".
- *Cause:* with AND, both conditions must be true, so the extra percentage could suppress a real alert.
- *Fix:* removed the percentage condition, so the alert fires on $1 alone.
- *Lesson:* also, instant (individual) anomaly alerts need an SNS topic, so I used daily email summaries until Terraform creates one.

**The Lambda concurrency limit made a project rule impossible.**
- *Problem:* the project requires every Lambda to reserve concurrency, but setting it failed.
- *Cause:* the new account's limit is 10 concurrent executions, and AWS keeps at least 10 unreserved, so nothing can be reserved.
- *Fix:* requested an increase to 1,000, built without reservations in the meantime, and recorded the exception and its risk (the kill switch could be briefly crowded out) in [ADR-003](adr/003-lambda-concurrency-exception.md), with a follow-up task.
- *Lesson:* check account quotas early. The limit also turned out to be a free account-wide cap on Lambda spend.

**Terraform refused my approved plan: "Saved plan is stale".**
- *Problem:* my SSO session expired just as I applied, so the apply failed with "No valid credential sources found". After signing in again, Terraform refused the plan I had reviewed.
- *Cause:* the failed attempt had already written a state file holding only lookups (account ID, region, zip file), which changed the state the plan was based on.
- *Fix:* confirmed the state contained no real resources, re-ran the plan, checked it was identical (15 to add, 0 to change, 0 to destroy), and approved it again before applying.
- *Lesson:* Terraform ties a saved plan to the exact state it was made from. That's a safety feature, and any approval should cover the plan that actually runs.

**"DynamoDB on-demand" wasn't free after all.**
- *Problem:* the plan, and the project's own rules, said to use DynamoDB on-demand as a free service.
- *Cause:* checking the pricing page before adding the table (a project rule) showed the always-free tier covers *provisioned* capacity only; on-demand requests are billed from the first one.
- *Fix:* switched to provisioned capacity of 5 reads and 5 writes per second, inside the free 25/25, and updated the rule ([ADR-006](adr/006-protected-data-stack.md)).
- *Lesson:* "serverless" doesn't automatically mean "free"; check each service's free-tier terms.

**The Lambda limit was raised, which changed the cost picture.**
- *Problem:* reserved concurrency had been impossible with a limit of 10 ([ADR-003](adr/003-lambda-concurrency-exception.md)).
- *Cause:* the limit was raised to 400, so reservations became possible, but the account-wide cap of 10 that had been limiting spend disappeared with it.
- *Fix:* reserved 2 for the kill switch (so it can always run) and 2 for the API (now the real cap on how fast junk requests can spend).

### Local tooling

**The AWS CLI wouldn't install.**
- *Problem:* `brew install awscli` compiled from source for a long time, then failed.
- *Cause:* Homebrew was the Intel version in `/usr/local` running under Rosetta on an Apple Silicon Mac, an unsupported setup with no prebuilt packages.
- *Fix:* migrated to native Homebrew in `/opt/homebrew`. Then `aws: command not found` in the same window, because the open terminal still had the old PATH; reloading the shell environment fixed it.
- *Lesson:* check the machine's architecture before blaming the tool. The migration also broke the prototype's old Python environment, so I rebuilt it in a separate one.

**The CLI saved my sign-in in the old format.**
- *Problem:* `aws configure sso` warned about a "legacy format".
- *Cause:* the session-name prompt had been left empty.
- *Fix:* cancelled and re-ran it with a session name, so the CLI can refresh sign-ins automatically.

**A shell command did nothing in zsh.**
- *Problem:* during the smoke test, sign-up failed with "Invalid length for parameter Username, value: 0".
- *Cause:* `read -p "Email: " EMAIL` is bash syntax; in zsh (the macOS default), `-p` reads from a coprocess, so the variable stayed empty.
- *Fix:* the zsh form `read "EMAIL?Email: "`.
- *Lesson:* commands that work in one shell can silently do nothing in another; check which shell you're in.

**The CLI couldn't sign in the secure way.**
- *Problem:* the app client allowed only SRP sign-in (the password is never sent), which the AWS CLI can't perform, so a smoke test couldn't get a token.
- *Fix:* also allowed `USER_PASSWORD_AUTH`, where the password goes over HTTPS to Cognito only, never to the API, with a backlog task to review it once the browser signs in with SRP.

### Code and tests

**The Python reference script crashed on the body mask.**
- *Problem:* `TypeError: only 0-dimensional arrays can be converted to Python scalars`.
- *Cause:* the segmentation mask came back as `(height, width, 1)` rather than `(height, width)`, so each pixel was a one-element array.
- *Fix:* dropped the extra axis with `squeeze()`.

**The production build failed because of a test file.**
- *Problem:* the parity test reads files with Node's `fs`, and the browser build's type check didn't know about Node.
- *Cause:* tests and app code shared one TypeScript configuration.
- *Fix:* gave the tests their own `tsconfig.test.json`, with Node types, and excluded them from the browser build.
- *Lesson:* Node-only test code now can't leak into the code that ships to browsers.

**Two API tests failed with 401 Unauthorized.**
- *Problem:* tests that moved a fake clock forward a week started getting "Token expired".
- *Cause:* the tests minted tokens that expire one hour after the original time; the API was correctly rejecting them.
- *Fix:* the tests now mint tokens relative to the fake clock's current time.
- *Lesson:* a failing test can be proof that the code works. Read the failure before changing the code.

**The password policy rejected a short password.**
- *Problem:* the first sign-up attempt failed with "Password not long enough".
- *Cause:* the policy requires at least 12 characters with upper case, lower case and a number; the password typed didn't meet it.
- *Fix:* generated a random 23-character password locally with `openssl rand`, so it never had to be typed or shown anywhere else. A rejected weak password is the policy working as intended.

**Scoring logic crept into the browser.**
- *Problem:* the History screen's "change since last check-in", built while UI work ran in parallel with the backend, computed the change in the browser with its own copy of the ±2% noise rule.
- *Cause:* the rule that scoring stays on the server ([ADR-002](adr/002-pose-extraction-in-browser.md)) wasn't visible from the UI files, so a second copy looked harmless.
- *Fix:* the API now returns `sinceLast` (scored by the same shared function as progress) and `noiseThreshold`; the browser copy was deleted, not just guarded by a test.
- *Lesson:* when two copies of a rule exist, calibrating one silently breaks the other. Delete the copy.

**Two work streams in one checkout.**
- *Problem:* UI polish and the measuring step were being built at the same time in the same working copy.
- *Fix:* claimed files before editing ("hold CheckIn.tsx until pushed"), reviewed the other stream's commits (tests, build, privacy, secrets) before building on them, and moved shared helpers into their own file so each stream owned different files.
- *Lesson:* agree who owns which file before editing, and review before you build on someone else's work.

**`.env.example` was invisible to Git.**
- *Problem:* the template showing which settings the app needs couldn't be committed.
- *Cause:* the `.env.*` ignore rule, meant for real secrets, also matched the example.
- *Fix:* an exception line, `!.env.example`; the real `.env.local` stays ignored.

**MediaPipe's console "errors" weren't errors.**
- *Problem:* the browser console showed "Created TensorFlow Lite XNNPACK delegate for CPU" as an error.
- *Cause:* MediaPipe logs this informational message at error level.
- *Fix:* none needed; the models ran correctly. Worth knowing so real errors aren't missed among them.

### Design problems found by testing

**The headline ratio compared two different things.**
- *Problem:* while porting the prototype, I noticed shoulders were measured joint to joint and the waist edge to edge.
- *Fix:* measured both edge to edge and added the plausibility check, then updated the Python reference so the parity test checks the new method ([ADR-004](adr/004-scale-free-measurements.md)).
- *Lesson:* port faithfully first, then change the logic as a separate, visible step, so porting bugs and design changes can't be confused.

**The user pool would have orphaned everyone's history.**
- *Problem:* the first data-protection design moved only the table out of the app stack.
- *Cause:* `userId` is the Cognito `sub`. If the user pool were destroyed with the app and recreated, every user would get a new `sub`, and the protected table would hold history nobody could reach.
- *Fix:* the user pool moved into the protected data stack with deletion protection ([ADR-006](adr/006-protected-data-stack.md)).
- *Lesson:* protecting data means protecting whatever its keys point to.

**The "ruler" was noisier than I estimated.**
- *Problem:* I first assumed hip-normalised widths would vary about 3% between photos.
- *Cause:* two photos of the same body in the same session gave indexes 11% apart, while the shoulder-to-waist ratio barely moved.
- *Fix:* recorded the real figure, kept the score on the steady ratio, stored raw per-photo values so a better ruler can be applied to past photos, and added a calibration task.
- *Lesson:* measure noise before trusting small changes.
