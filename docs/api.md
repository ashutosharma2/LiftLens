# Measurements API (V1)

## Summary (SOART)

- **Scenario:** the browser measures each photo locally and needs somewhere to save the numbers and get a score back.
- **Obstacle:** the browser runs on a device the user controls, so any request can be edited, and the server can't trust the user ID, the time or a claimed ratio. Photos are also discarded, so anything not saved at check-in is lost.
- **Action:** the user ID comes only from the verified Cognito token. The server stamps the time and works out the ratio and shoulder check itself. The body accepts exactly seven fields, each with strict limits. Raw per-photo values are stored and scores are recomputed on every read ([ADR-005](adr/005-store-ingredients-recompute-scores.md)).
- **Result:** one user can never read or write another's history, impossible values never reach the database, and formula improvements apply to the whole history. 63 tests cover every rule below.
- **Troubleshooting:** unknown paths originally returned 405; they now return 404, with 405 kept for wrong methods. Tests that moved a fake clock forward got 401 because their tokens had expired. The API was right, so the tests now mint tokens from the fake clock.

The rest of this document is the reference contract.

One Lambda behind a Lambda Function URL, served through CloudFront at `/api/*` on the same domain as the web app. Requests and responses are JSON.

The browser measures the photo and sends only numbers ([ADR-002](adr/002-pose-extraction-in-browser.md)). Every request is treated as untrusted: the browser runs on the user's device, and anyone can edit a request in DevTools.

## Authentication

Every request needs `Authorization: Bearer <Cognito ID token>`. The Lambda verifies the token's signature, issuer, audience and expiry, and takes the user's ID from its `sub` claim.

**The user ID never comes from the request body.** If it did, anyone could read or write another user's history by changing one field.

## Data model

DynamoDB table `liftlens-measurements`, provisioned at 5 reads and 5 writes per second inside the free tier ([ADR-006](adr/006-protected-data-stack.md)). One item per measurement.

| Attribute | Type | Key | Meaning |
|---|---|---|---|
| `userId` | string | partition key | Cognito `sub` of the owner |
| `timestamp` | string (ISO 8601, UTC) | sort key | When the server saved it |
| `shoulderToWaist` | number | | `shoulderEdgePx ÷ waistEdgePx`, computed by the server |
| `shoulderEdgePx` | number | | Outer shoulder width, edge to edge |
| `waistEdgePx` | number | | Waist width, edge to edge |
| `shoulderJointPx` | number | | Distance between the shoulder joint landmarks |
| `hipJointPx` | number | | Distance between the hip joint landmarks |
| `torsoLengthPx` | number | | Shoulder line to hip line |
| `shoulderCheck` | string | | `ok`, `too_wide` or `too_narrow`, computed by the server |
| `armAngleDeg` | number | | Upper arms' angle from straight down (0 to 90°): the pose, matched against the baseline's in the browser ([ADR-008](adr/008-capture-checks-and-pose-matching.md)) |
| `methodVersion` | string | | Which measuring method (outline source plus maths) produced the numbers ([ADR-007](adr/007-pose-model-outline.md)) |

Not stored: the photo (it never leaves the device), the user's email (Cognito has it), and scores (recomputed on every read, see [ADR-005](adr/005-store-ingredients-recompute-scores.md)).

Pixel values are never shown to users, because they depend on camera distance ([ADR-004](adr/004-scale-free-measurements.md)). They are stored as ingredients, so ratios and rulers invented later can be computed for old photos too.

**Baseline:** each `methodVersion` has its own, which is the earliest item of that method with `shoulderCheck = "ok"`, found by reading the user's items in order. Different methods are different rulers, so scores never compare across them ([ADR-007](adr/007-pose-model-outline.md)). A user adds about one item a week, so reading them all stays small.

## `POST /api/measurements`

Saves one measurement and returns it with its score.

**Request body.** Exactly these fields; unknown fields are rejected.

```json
{
  "shoulderEdgePx": 1029,
  "waistEdgePx": 577,
  "shoulderJointPx": 690,
  "hipJointPx": 364,
  "torsoLengthPx": 905,
  "armAngleDeg": 20.5,
  "methodVersion": "2026-10-posemask-v2"
}
```

**Validation**

| Rule | Error |
|---|---|
| Body larger than 2 KB | 413 |
| Body isn't a JSON object, a field is missing, or an unknown field is present | 400 |
| Any pixel value isn't a finite number between 1 and 10,000 | 400 |
| `armAngleDeg` isn't a finite number between 0 and 90 | 400 |
| `methodVersion` isn't the current version (`2026-10-posemask-v2`); earlier methods stay readable but can't be added to | 400 |
| `shoulderEdgePx ÷ waistEdgePx` is outside 0.8 to 3.0 | 400 |

Error responses name the field: `{"error": "waistEdgePx must be between 1 and 10000"}`.

**Server-side steps**

1. Verify the token; take `userId` from `sub`.
2. Validate the body.
3. Compute `shoulderToWaist` and `shoulderCheck` (outer shoulder ÷ shoulder joints, plausible range 1.1 to 1.8).
4. Stamp `timestamp` with the server's current UTC time.
5. Save the item.
6. Read the user's items, find the baseline of this item's method, compute the score.

**Response `201`**

```json
{
  "measurement": {
    "timestamp": "2026-10-10T09:30:00Z",
    "shoulderToWaist": 1.783,
    "shoulderCheck": "ok",
    "methodVersion": "2026-10-posemask-v2",
    "isBaseline": false
  },
  "score": {
    "name": "shoulder_to_waist_change_percent",
    "value": 4.88,
    "status": "increased",
    "formula": "(current - baseline) / baseline × 100",
    "inputs": {"current": 1.783, "baseline": 1.7, "noise_threshold": 0.024},
    "explanation": "Your shoulder-to-waist ratio rose 4.9% since your first photo (1.70 → 1.78)."
  },
  "sinceLast": {
    "name": "shoulder_to_waist_change_since_previous_percent",
    "value": 3.06,
    "status": "increased",
    "formula": "(current - previous) / previous × 100",
    "inputs": {"current": 1.783, "previous": 1.73, "noise_threshold": 0.024},
    "explanation": "Your shoulder-to-waist ratio rose 3.1% since your previous check-in (1.73 → 1.78)."
  }
}
```

Pixel ingredients are stored but not returned.

## `GET /api/measurements`

Returns all of the signed-in user's measurements, oldest first, each with its score recomputed.

**Response `200`**

```json
{
  "currentMethodVersion": "2026-10-posemask-v2",
  "baselineTimestamp": "2026-09-01T08:00:00Z",
  "baselineArmAngleDeg": 20.5,
  "noiseThreshold": 0.024,
  "measurements": [
    {
      "timestamp": "2026-09-01T08:00:00Z",
      "shoulderToWaist": 1.7,
      "shoulderCheck": "ok",
      "methodVersion": "2026-10-posemask-v2",
      "isBaseline": true,
      "score": {"status": "baseline", "explanation": "Your shoulders are 1.70× as wide as your waist.", "...": "..."},
      "sinceLast": null
    },
    {
      "timestamp": "2026-09-08T08:00:00Z",
      "shoulderToWaist": 2.1,
      "shoulderCheck": "too_wide",
      "methodVersion": "2026-10-posemask-v2",
      "isBaseline": false,
      "score": {"status": "flagged", "explanation": "This photo was flagged (your arms may be in the shoulder outline), so it isn't used for progress.", "...": "..."},
      "sinceLast": null
    }
  ]
}
```

`currentMethodVersion` is the method of the most recent item (`null` with no items); the app's trend shows only items of this method. `baselineTimestamp` is that method's baseline, `null` until it has an `ok` measurement. `isBaseline` is true for every method's baseline. `baselineArmAngleDeg` is that baseline's arm angle (`null` without one, or for methods before arm angles were stored); the app retakes photos whose arms are more than 2° off it. `noiseThreshold` is the server's noise band (0.024 = ±2.4%), so the app's chart always matches the score.

`sinceLast` is the change since the previous `ok` measurement of the same method (flagged ones are skipped), scored with the same rule as the main score. It's `null` for flagged items and for the first `ok` item of each method. The app only displays it and never computes it.

## Scores per item

| Item | Score |
|---|---|
| Flagged (`shoulderCheck` isn't `ok`) | Status `flagged`, no percent change; shown greyed out |
| A method's baseline | `ratio_result`, status `baseline` |
| Any other `ok` item | `progress_result` against the baseline of its own method |
| An `ok` item when its method has no baseline yet | Can't happen: the first `ok` item of each method is its baseline |

Formulas and wording are in [scoring.md](scoring.md).

## Errors

| Status | When |
|---|---|
| 400 | Invalid body (message names the field) |
| 401 | Missing, invalid or expired token |
| 404 | Any path other than `/api/measurements` |
| 405 | Any method other than `GET` or `POST` |
| 413 | Body larger than 2 KB |
| 503 | The table's free-tier capacity is momentarily exceeded; try again ([ADR-006](adr/006-protected-data-stack.md)) |
| 500 | Unexpected error (details only in the Lambda's logs) |
