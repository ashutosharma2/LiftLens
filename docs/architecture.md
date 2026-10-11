# LiftLens architecture diagrams

## Summary (SOART)

- **Scenario:** LiftLens turns a front-facing photo into a shoulder-to-waist measurement and tracks it over time, on AWS, at $0/month.
- **Obstacle:** the design decisions are spread across six ADRs, the API contract and the scoring spec; there was no single picture of how the pieces fit, and the previous version of this file described an abandoned FastAPI design.
- **Action:** one diagram per view of the system, each drawn from the code and Terraform as they are today. Solid lines and boxes are built; dashed ones are planned.
- **Result:** the whole system can be followed from the photo to the stored number, from sign-up to a saved measurement, and from a $1 bill to a stopped app.
- **Troubleshooting:** the diagrams are only useful while they're accurate, so they're updated at the end of every milestone, alongside the README.

**Contents**

1. [System context](#1-system-context)
2. [Containers](#2-containers)
3. [Browser app components](#3-browser-app-components)
4. [API Lambda components](#4-api-lambda-components)
5. [AWS infrastructure and Terraform stacks](#5-aws-infrastructure-and-terraform-stacks)
6. [Identity and access](#6-identity-and-access)
7. [Trust boundaries](#7-trust-boundaries)
8. [Sign-up and sign-in](#8-sign-up-and-sign-in)
9. [Check-in capture states](#9-check-in-capture-states)
10. [Measurement pipeline](#10-measurement-pipeline)
11. [Saving a measurement](#11-saving-a-measurement)
12. [Scoring decisions](#12-scoring-decisions)
13. [Data model](#13-data-model)
14. [Cost guardrails](#14-cost-guardrails)
15. [Deployment](#15-deployment)

---

## 1. System context

Who and what LiftLens interacts with. The photo never leaves the user's device; only numbers reach AWS.

```mermaid
flowchart LR
    User(["Gym-goer"])
    Owner(["Owner / operator"])

    subgraph LiftLens["LiftLens"]
        App["Browser app<br/>measures photos on the device"]
        Backend["AWS backend<br/>accounts, measurements, scores"]
    end

    Inbox["User's email inbox"]
    GitHub["GitHub<br/>code + CI/CD"]

    User -- "takes photo, reads results" --> App
    App -- "numbers only, over HTTPS" --> Backend
    Backend -- "verification and reset codes" --> Inbox
    Owner -- "terraform plan / apply" --> Backend
    Owner -- "pushes commits" --> GitHub
    GitHub -. "deploys (M5)" .-> Backend
    Backend -- "cost alerts" --> Owner
```

## 2. Containers

The deployable pieces and how they talk. Until CloudFront exists (M4), the local dev server forwards `/api/*` to the Function URL, the same path CloudFront will use.

```mermaid
flowchart LR
    subgraph Device["User's device"]
        SPA["React app<br/>Vite, TypeScript, Tailwind"]
        MP["MediaPipe in the browser<br/>pose + segmenter (WASM/WebGL)"]
        SPA --> MP
    end

    subgraph Edge["Delivery"]
        Dev["Vite dev server<br/>proxies /api/* (local)"]
        CF["CloudFront + private S3<br/>app, model files, /api/*"]
    end

    subgraph AWS["AWS ap-south-1"]
        URL["Lambda Function URL<br/>public, token checked inside"]
        API["API Lambda<br/>Python 3.13, arm64"]
        Cognito["Cognito user pool<br/>Lite tier"]
        DB[("DynamoDB<br/>liftlens-measurements")]
        Logs["CloudWatch Logs<br/>7-day retention"]
    end

    SPA -- "sign-up / SRP sign-in" --> Cognito
    SPA -- "/api/measurements + ID token" --> Dev
    Dev --> URL
    SPA -.-> CF
    CF -. "/api/*" .-> URL
    URL --> API
    API -- "public keys (cached)" --> Cognito
    API -- "PutItem / Query" --> DB
    API --> Logs

    class CF planned
    classDef planned stroke-dasharray: 5 5
```

## 3. Browser app components

How the frontend code is organised. Pure modules (unit-tested without a browser) are separate from the ones that talk to the camera, the models or the network.

```mermaid
flowchart TB
    subgraph Screens["screens/"]
        Auth["SignIn · SignUp · Verify · ForgotPassword"]
        Layout["AppLayout<br/>signed-in guard"]
        HistoryS["History"]
        CheckIn["CheckIn"]
    end

    subgraph Capture["capture/"]
        Flow["flow.ts<br/>state machine (pure)"]
        Camera["camera.ts · photo.ts · countdown.ts · beep.ts"]
    end

    subgraph Measure["measure/"]
        Models["models.ts<br/>MediaPipe wrappers (browser only)"]
        Maths["maths.ts<br/>edges, ratio, checks (pure)"]
    end

    subgraph HistoryM["history/"]
        Trend["trend.ts<br/>display helpers (pure)"]
        Charts["TrendChart · Sparkline · BodyMap"]
    end

    subgraph Infra["auth/ · api/"]
        Amplify["amplify.ts · session.ts<br/>Amplify Auth (SRP, token refresh)"]
        Client["client.ts<br/>API client"]
    end

    Auth --> Amplify
    Layout --> Amplify
    HistoryS --> Client
    HistoryS --> Trend
    HistoryS --> Charts
    CheckIn --> Flow
    CheckIn --> Camera
    CheckIn -. "step 3" .-> Models
    Models -. "landmarks + mask rows" .-> Maths
    CheckIn -. "Save" .-> Client
    Client --> Amplify
```

## 4. API Lambda components

One Lambda, split so everything except `store.py` and the key download is pure and tested with fakes.

```mermaid
flowchart TB
    Event["Function URL event"] --> App["app.py<br/>route, errors → status codes"]
    App --> Auth["auth.py<br/>verify ID token (PyJWT)"]
    Auth --> Keys["JwksCache<br/>Cognito public keys, fetched once"]
    App --> Val["validation.py<br/>2 KB cap, exact fields, ranges"]
    App --> Meas["measurements.py<br/>ratio, shoulder check, history scoring"]
    Meas --> Score["score.py<br/>ratio, change, flagged results"]
    App --> Store["store.py<br/>DynamoDB, Decimal, 503 on throttling"]
    Store --> DB[("DynamoDB")]
    Keys --> Cognito["Cognito JWKS endpoint"]
```

## 5. AWS infrastructure and Terraform stacks

Three Terraform roots with different lifecycles. Destroying `app` can never remove cost protection or user data. Tags let the kill switch find app resources without sharing state.

```mermaid
flowchart TB
    subgraph G["infra/guardrails · never destroyed · applied as SSO admin"]
        Budget["Budget liftlens-guardrail ($1)"]
        Action["Budget action"]
        Deny["Policy liftlens-deny-all"]
        DeployRole["Role liftlens-deploy"]
        SNS["SNS liftlens-guardrail-alerts"]
        Kill["Lambda liftlens-kill-switch<br/>reserved 2"]
        KillLogs["Log group (7 days)"]
    end

    subgraph D["infra/data · deletion-protected · applied as liftlens-deploy"]
        Table[("DynamoDB liftlens-measurements<br/>provisioned 5/5")]
        Pool["Cognito liftlens-users<br/>+ app client liftlens-web"]
    end

    subgraph A["infra/app · destroy freely · applied as liftlens-deploy"]
        ApiFn["Lambda liftlens-api<br/>reserved 2, 10 s"]
        FnUrl["Function URL (public)"]
        ApiLogs["Log group (7 days)"]
        ApiRole["Role liftlens-api-role"]
        Web["S3 + CloudFront (M4)"]
    end

    Budget --> SNS --> Kill
    Budget --> Action -- "attach" --> Deny -. "locks" .-> DeployRole
    Kill -- "Stack=app tag" --> ApiFn
    Kill -. "Stack=app tag" .-> Web
    FnUrl --> ApiFn
    ApiFn --> Table
    ApiFn -- "verifies tokens from" --> Pool

    class Web planned
    classDef planned stroke-dasharray: 5 5
```

## 6. Identity and access

Who can do what. People sign in with temporary credentials only; every service role is limited to exactly what it needs.

```mermaid
flowchart LR
    subgraph People
        Owner(["Owner"])
        AppUser(["App user"])
    end

    Owner -- "passkey MFA" --> Root["Root user<br/>account settings only"]
    Owner -- "SSO + MFA, 4 h" --> Admin["AdministratorAccess<br/>(Identity Center)"]
    Admin -- "AssumeRole, 1 h" --> Deploy["liftlens-deploy<br/>(lockable by budget action)"]
    Admin -- "applies" --> GStack["guardrails stack"]
    Deploy -- "applies" --> DAStack["data + app stacks"]
    CI["GitHub Actions"] -. "OIDC (M5)" .-> Deploy

    AppUser -- "email + password (SRP)" --> Pool["Cognito"]
    Pool -- "ID token (1 h)" --> AppUser

    subgraph Roles["Service roles (least privilege)"]
        ApiR["liftlens-api-role<br/>PutItem + Query on one table, own logs"]
        KillR["liftlens-kill-switch<br/>tag search, concurrency on Stack=app,<br/>CloudFront update on Stack=app, own logs"]
        BudgetR["liftlens-budget-action<br/>attach/detach deny-all on liftlens-deploy only"]
    end
```

## 7. Trust boundaries

What each side trusts. The server treats every request as possibly edited; the photo never crosses the boundary.

```mermaid
flowchart LR
    subgraph Untrusted["User's device (untrusted)"]
        Photo["Photo<br/>stays here"]
        Numbers["Pixel measurements"]
        Token["ID token"]
    end

    subgraph Trusted["AWS (trusted)"]
        Verify["Token check<br/>signature, issuer, client, expiry"]
        Validate["Validation<br/>fields, ranges, 2 KB"]
        Compute["Server computes<br/>userId (from token), timestamp,<br/>ratio, shoulder check, scores"]
        Data[("Stored item")]
    end

    Numbers -- "HTTPS" --> Validate
    Token -- "HTTPS" --> Verify
    Verify --> Compute
    Validate --> Compute
    Compute --> Data
```

## 8. Sign-up and sign-in

Amplify runs SRP, so the password itself is never sent. Tokens refresh quietly; a 401 sends the user back to sign in.

```mermaid
sequenceDiagram
    actor U as User
    participant App as Browser app (Amplify)
    participant C as Cognito
    participant M as Email
    participant API as API Lambda

    U->>App: email + new password
    App->>C: SignUp
    C->>M: 6-digit code
    U->>App: enter code
    App->>C: ConfirmSignUp
    U->>App: email + password
    App->>C: SRP sign-in (password not sent)
    C-->>App: ID token (1 h) + refresh token (30 days)
    App->>API: GET /api/measurements + ID token
    API->>API: verify token with cached public keys
    API-->>App: 200 history
    Note over App,C: Before expiry, Amplify refreshes the ID token
    API-->>App: 401 if token expired or invalid
    App->>U: back to Sign in, then return to the same page
```

## 9. Check-in capture states

`flow.ts` as a state machine. The camera runs only in `opening`, `live` and `countdown`; leaving them, or the screen, turns it off.

```mermaid
stateDiagram-v2
    [*] --> setup
    setup --> opening: Open camera
    setup --> review: photo uploaded
    setup --> setup: camera or file problem (message shown)
    opening --> live: camera ready
    opening --> setup: failed / cancel
    live --> countdown: Start (10 s)
    live --> setup: cancel / failed
    countdown --> countdown: tick
    countdown --> review: captured
    countdown --> live: cancel
    countdown --> setup: failed
    review --> opening: Retake (camera)
    review --> setup: Retake (upload)
    review --> ready: Use photo
    ready --> measuring: step 3
    ready --> setup: restart

    state measuring {
        [*] --> planned
    }
```

## 10. Measurement pipeline

From photo to ratio, all on the device. Only the five pixel ingredients and the method version are sent.

```mermaid
flowchart LR
    Photo["Photo (canvas)"] --> Pose["Pose landmarker<br/>33 landmarks"]
    Photo --> Seg["Selfie segmenter<br/>person / background mask"]
    Pose --> Pts["Shoulder + hip joints<br/>(pixels)"]
    Pts --> Rows["Shoulder line y<br/>waist y = 65% to hips<br/>torso centre x"]
    Seg --> Rows
    Rows --> Edges["Walk each mask row<br/>outward to the body edges"]
    Edges --> Widths["Shoulder edge width<br/>waist edge width"]
    Pts --> Joints["Shoulder joint width<br/>hip joint width<br/>torso length"]
    Widths --> Check{"edge ÷ joint<br/>1.1 – 1.8?"}
    Joints --> Check
    Widths --> Send["POST ingredients<br/>+ methodVersion"]
    Joints --> Send
    Check -. "step 3: show problem / retake" .-> Retake["Retake"]

    class Retake planned
    classDef planned stroke-dasharray: 5 5
```

## 11. Saving a measurement

The server, not the browser, decides the user, the time, the ratio and every score.

```mermaid
sequenceDiagram
    participant App as Browser app
    participant API as API Lambda
    participant DB as DynamoDB

    App->>API: POST /api/measurements (ingredients + ID token)
    API->>API: verify token → userId = sub
    API->>API: validate body (exact fields, 1–10,000 px, ratio 0.8–3.0, ≤ 2 KB)
    API->>API: ratio, shoulderCheck, server timestamp
    API->>DB: PutItem
    alt over provisioned capacity
        DB-->>API: throttled
        API-->>App: 503 busy, try again
    end
    API->>DB: Query userId (all pages)
    DB-->>API: user's items
    API->>API: baseline = first ok item, score each item, sinceLast
    API-->>App: 201 measurement + score + sinceLast
```

## 12. Scoring decisions

How each stored item gets its score, recomputed on every read.

```mermaid
flowchart TB
    Item["Stored item"] --> Ok{"shoulderCheck = ok?"}
    Ok -- "no" --> Flagged["flagged_result<br/>shown greyed, not scored"]
    Ok -- "yes" --> First{"first ok item?"}
    First -- "yes" --> Base["ratio_result<br/>'Your shoulders are 1.78× as wide as your waist.'"]
    First -- "no" --> Prog["progress_result vs baseline"]
    First -- "no" --> Since["since_previous_result vs previous ok item"]
    Prog --> Noise{"|change| < 2%?"}
    Since --> Noise
    Noise -- "yes" --> NC["no_clear_change"]
    Noise -- "no" --> Dir["increased / decreased"]
```

## 13. Data model

One DynamoDB item per measurement, keyed by the Cognito user's `sub` and the server's timestamp. Scores are never stored.

```mermaid
erDiagram
    COGNITO_USER ||--o{ MEASUREMENT : "sub = userId"
    COGNITO_USER {
        string sub PK "permanent user ID"
        string email "verified"
    }
    MEASUREMENT {
        string userId PK "partition key = Cognito sub"
        string timestamp PK "sort key, server UTC"
        number shoulderToWaist "computed by server"
        number shoulderEdgePx "ingredient"
        number waistEdgePx "ingredient"
        number shoulderJointPx "ingredient"
        number hipJointPx "ingredient"
        number torsoLengthPx "ingredient"
        string shoulderCheck "ok, too_wide, too_narrow"
        string methodVersion "e.g. 2026-10-edge-v1"
    }
```

## 14. Cost guardrails

What happens when the month's bill passes $1. The kill switch only touches `Stack=app` resources; restoring service is manual.

```mermaid
sequenceDiagram
    participant B as AWS Budgets
    participant E as Owner's email
    participant S as SNS topic
    participant K as Kill-switch Lambda
    participant T as Tagging API
    participant L as App Lambdas
    participant CF as App CloudFront
    participant D as liftlens-deploy role

    Note over B: actual spend > $1 (hours of billing lag)
    B->>E: alert email
    B->>S: publish
    S->>K: invoke (reserved concurrency 2)
    K->>T: find Project=LiftLens, Stack=app
    K->>L: reserved concurrency → 0
    K-->>CF: disable (M4)
    B->>D: budget action attaches liftlens-deny-all
    Note over D: deploys locked until the owner detaches it
```

## 15. Deployment

How changes reach AWS today, and with CI/CD from M5. Every apply follows a reviewed plan.

```mermaid
flowchart LR
    Code["Commit on main"] --> Build["backend/api/build.sh<br/>Linux arm64 package"]
    Build --> Plan["terraform plan"]
    Plan --> Review{"Owner reviews plan<br/>says yes"}
    Review --> Apply["terraform apply"]
    Apply --> Smoke["Smoke test<br/>401 without token, real sign-in"]

    Code -. "pull request" .-> PRChecks["GitHub Actions: fmt, validate,<br/>tests, plan comment"]
    PRChecks -. "merge" .-> Approve["Protected environment<br/>manual approval"]
    Approve -. "OIDC, liftlens-deploy" .-> CIApply["apply + build frontend<br/>sync to S3, invalidate CloudFront"]

    class PRChecks,Approve,CIApply planned
    classDef planned stroke-dasharray: 5 5
```
