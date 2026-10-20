# ADR-002: Pose extraction runs in the browser

- Status: Accepted
- Date: 2026-10-07

## Scenario

LiftLens turns a physique photo into body measurements. The heavy step is the pose model (MediaPipe pose landmarker, about 6 MB), which finds 33 body landmarks; the measurements are simple arithmetic on those points. The working prototype is in Python (`dev/landmark_test.py`).

## Obstacle

The model has to run somewhere, and the two places pull in opposite directions:

| | Browser (MediaPipe Tasks Vision JS) | Container-image Lambda (Python MediaPipe) |
|---|---|---|
| Cost | Runs on the user's device; AWS stores only numbers | MediaPipe + OpenCV exceed the 250 MB zip limit, so it needs a container image in ECR (roughly 0.5 to 1 GB, about $0.05 to $0.10 a month, not always-free), an S3 upload bucket and 1 to 3 s of compute per photo |
| Privacy | The photo never leaves the device | Body photos are uploaded to and stored in AWS |
| Latency | One-time model download, then well under a second per photo on most devices | Upload, plus a cold start of a large container (often several seconds), plus processing |
| Accuracy | Same model family on WebGL/WASM; small differences between devices | Identical hardware every time |
| Existing code | Port the measurement logic to TypeScript | Reuse the Python prototype |

## Action

Pose detection and measurement run in the browser. The photo never leaves the user's device, and the API receives only the resulting numbers.

Privacy decided it. Physique photos are very sensitive personal data, and if LiftLens never receives them, there's nothing to leak, secure or delete, and nobody has to trust us with them. Dropping the ECR cost also helps with the $0 constraint.

The alternative was a container-image Lambda. It would reuse the Python prototype and give identical results everywhere, but it uploads and stores body photos and adds an ongoing ECR cost. Rejected on privacy.

## Result

- **Port to TypeScript.** The landmark and measurement logic moved to `frontend/src/measure/`. Unit tests run it on the fixture photos and compare against the Python reference within a tolerance, so porting mistakes and device drift are measurable. Fixtures stay gitignored; the tests skip when they're missing.
- **Device variation.** Results can differ slightly between devices. Accepted for a personal progress tracker, where the same user usually measures on the same device.
- **Trust boundary.** The API receives numbers, not photos, so it cannot prove a measurement came from a real photo. Accepted: LiftLens is a personal tracker, and a user who submits fake numbers only misleads themselves. The API still rejects physically impossible values.
- **Scoring stays server-side.** The score and its explanation are computed in the Python API Lambda, so there is one trusted implementation.
- **Model files are self-hosted.** The `.task` and `.wasm` files are served from our own S3 + CloudFront instead of a third-party CDN.

## Troubleshooting

- **MediaPipe JS can't run in unit tests.** It needs WASM and WebGL in a real browser, so Vitest can't execute it. Fix: split the code into `models.ts` (browser only) and `maths.ts` (pure functions), and prove the port with a parity test: a Python script exports each photo's landmarks and mask rows plus its results, and the TypeScript maths must reproduce them within 1%.
- **The reference script crashed on the mask.** `TypeError: only 0-dimensional arrays can be converted to Python scalars`, because the mask came back as `(height, width, 1)`. Fix: `squeeze()` the extra axis.
- **The browser build failed on a test file.** The parity test uses Node's `fs`, which the browser type configuration doesn't know. Fix: tests get their own `tsconfig.test.json` and are excluded from the browser build.
- **Scoring logic crept into the browser.** The History screen's "change since last check-in" was first built in the browser, with its own copy of the ±2% noise threshold, which went against "scoring stays server-side". Calibrating the threshold later would have meant changing two copies, or History and the score would disagree. Fix: the API returns `sinceLast` (scored by the same shared function as progress) and `noiseThreshold`, and the browser copy was deleted rather than just guarded by a test.
