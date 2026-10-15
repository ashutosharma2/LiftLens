# Scoring (V1)

## Summary (SOART)

- **Scenario:** each saved measurement needs a score that tells the user whether their shape is changing, with nothing hidden.
- **Obstacle:** a score needs a reference point; an "ideal body" target is unscientific and alienating, invented points hide the real number, and photo-to-photo noise can look like progress.
- **Action:** score only the steady shoulder-to-waist ratio; show it as is on the first photo, then as a percent change against the user's own first photo; treat changes under ±2% as noise; return the formula, inputs and a one-sentence explanation with every result.
- **Result:** every number can be checked by hand ((1.78 − 1.70) ÷ 1.70 = 4.7%); 20 tests cover rises, falls, noise, flagged photos and bad input.
- **Troubleshooting:** the hip-normalised indexes were first expected to vary about 3% between photos but varied 11% on two same-session photos, so they were left out of the score; the first calibration photos in a cluttered room measured furniture as part of the body, which led to a new outline method and one baseline per method ([ADR-007](adr/007-pose-model-outline.md)); the ±2% noise threshold is a placeholder until it's calibrated on that method (see below).

The rest of this document is the reference specification.

Code: `backend/scoring/score.py` (tests in `test_score.py`).

## What is scored

One number: the **shoulder-to-waist ratio**, with both widths measured edge to edge on the body outline (see [ADR-004](adr/004-scale-free-measurements.md)).

Why only this one:

- **It was the steadiest number.** The hip-normalised indexes differed by 11% between two photos of the same person, so they aren't reliable enough to score yet. (Those two photos first gave 1.784 and 1.785; that match later turned out to be a coincidence, see [ADR-007](adr/007-pose-model-outline.md).)
- **It's the number lifters already track.** Shoulder-to-waist is the standard measure of a V-taper.

LiftLens tracks this number; it does not judge it against an "ideal" value such as 1.618. Scores compare a user only with their own first photo, and only with photos measured by the same method: each `methodVersion` has its own baseline ([ADR-007](adr/007-pose-model-outline.md)).

## The two results

| Shown from | Result | Formula |
|---|---|---|
| First photo | `ratio_result` | `shoulder_width / waist_width` |
| Second photo on | `progress_result` | `(current - baseline) / baseline × 100`, where `baseline` is the ratio of the first `ok` photo measured with the same method |
| Every `ok` photo after the first | `since_previous_result` | `(current - previous) / previous × 100`, where `previous` is the last `ok` photo of the same method before it; shown as "since last check-in" |
| Flagged photo (shoulder check failed) | `flagged_result` | Not scored; shown greyed out and never used as the baseline |

Every result returns:

| Field | Meaning |
|---|---|
| `name` | What was scored |
| `value` | The number, at full precision |
| `status` | `baseline`, `increased`, `decreased`, `no_clear_change` or `flagged` |
| `formula` | The formula as text |
| `inputs` | Every number that went into it, by name |
| `explanation` | One plain-English sentence (numbers rounded for reading only) |

Progress is shown as a **percent change**, not points. Points would need an invented scale (how many points is 1%? what is 100?) that every explanation would then have to unwrap; a percent change is the honest number with nothing to unwrap.

Both change scores use one shared function, so they always apply the same noise rule. The app never recomputes them: it displays what the API returns, including the noise threshold for its chart.

Status words describe, they don't judge: a rising ratio is "increased", not "better", because users don't all share the same goal.

## Worked example

Riya's shoulder-to-waist ratio over three photos:

| Photo | Ratio | Result | Explanation |
|---|---|---|---|
| Week 0 | 1.70 | baseline | "Your shoulders are 1.70× as wide as your waist." |
| Week 4 | 1.71 | +0.6%, no clear change | "Your shoulder-to-waist ratio changed +0.6% since your first photo (1.70 → 1.71), within the ±2% measurement noise, so there's no clear change yet." |
| Week 12 | 1.78 | +4.7%, increased | "Your shoulder-to-waist ratio rose 4.7% since your first photo (1.70 → 1.78)." |

Check week 12 by hand: (1.78 − 1.70) ÷ 1.70 × 100 = 4.7.

## Measurement noise

Photos of an unchanged body still vary a little (angle, posture, lighting). A change smaller than `NOISE_THRESHOLD` is reported as "no clear change".

- Current value: **±2%**, a cautious placeholder.
- To calibrate it: take about 5 front photos in one session, measure the shoulder-to-waist ratio of each, and set the threshold to about **twice their spread** (largest minus smallest, as a fraction of the average). Update the constant and this section.

## Input checks

Ratios that aren't finite numbers, or fall outside **0.8–3.0**, are rejected with an error naming the bad input. The API receives measurements, not photos (see [ADR-002](adr/002-pose-extraction-in-browser.md)), so this is where impossible values are stopped.

## What the score does not do

- No "attractiveness" or "aesthetics" number, and no comparison with an ideal body.
- No comparison with other users.
- No hidden weights or learned models: the formula above is the whole calculation.
