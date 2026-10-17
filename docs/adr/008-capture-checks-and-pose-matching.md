# ADR-008: Catch and guide bad photos; match the baseline's pose

- Status: Accepted
- Date: 2026-10-17

## Scenario

With the pose model's outline ([ADR-007](007-pose-model-outline.md)) and a calibrated ±2.4% noise band, the measuring itself was reliable. Calibration photos showed the remaining risk: photos the app accepted although their numbers meant nothing, from a sideways phone to hands on the hips.

## Obstacle

1. **Confident wrong numbers.** A sideways photo, hands touching the waist or a back view all produced a ratio and a Save button, with no warning.
2. **Pose changes the ratio more than the noise does.** Across real photos, upper arms at about 16° gave 1.74–1.77, at about 26° gave 1.90, and at 35° gave 1.61. The ±2.4% band only covers one held pose, so a user holding their arms differently each week would see fake progress up to three times the band.
3. **Guesses were wrong twice.** A 40% "too far" limit would have rejected the calibration setup (31%) that measured well. "Face landmarks fade from behind" was wrong too: a back photo still had face visibility 0.98.

## Action

**Each problem gets a check with a signal, a rule and a fix-it message.** Every check is a retake: the numbers would be meaningless. Only the first failing check is shown, in this order:

| Check | Signal | Rule | Evidence |
|---|---|---|---|
| Sideways | Photo shape | Wider than tall | Landscape photos read 0.80–1.06 |
| Back photo | Left/right shoulder order | Left shoulder on the image's left | Front, mirror and room photos all had it on the right; the back photo on the left |
| Too far | Shoulder width as a share of the photo width | Under 15% | Shrinking a good photo showed no drift down to 14%; detection failed at 11% |
| Hand at the shoulder | Wrists from 0.4 above to 0.35 below the shoulder line | Inside, or within 10% of shoulder width outside, a shoulder edge | A mirror selfie's phone hand sat at −0.05 and read 1.99 (about 1.8 normally); every relaxed wrist in 11 photos was at +0.59 or lower |
| Arms touching | Wrists and elbows at 40–90% of the way from shoulders to hips | Within 10% of shoulder width outside a waist edge, or inside it | Hands on hips: −8% and −14%. Arms clear: 22–75% |
| Pose | Upper-arm angle (shoulder → elbow, from straight down), averaged over both arms | Within ±2° of the baseline photo's angle; 5–35° before a baseline exists (relaxed arms measured 7.7–11.7°) | Same room and day: 21.3° read 1.93 and about 17° read 1.83, about 1.3% per degree |

**The pose is matched against the user's own baseline, not a fixed range,** so LiftLens keeps comparing a user only with themselves. The arm angle is stored with every check-in, and the API returns the baseline's angle. This made the arm angle part of the method: version `2026-10-posemask-v2`, so the score baseline and the pose reference are always the same photo.

**The checks run in the browser.** They guide the person taking the photo; a tampered app could only skip a retake for its own user's data.

Alternatives considered:

- **Flag instead of retake.** Flagged photos are still saved and shown. These numbers aren't doubtful, they're meaningless, so they shouldn't be saved at all.
- **A fixed arm-angle range for everyone.** Simpler, but anywhere inside a 15–30° range can shift the ratio by several percent.
- **Keep the existing baseline and take the pose reference from the next check-in.** Nothing relabelled, but scores and pose would be compared with different photos.

## Result

- Every failure seen during calibration now gets a specific message instead of a number.
- The ±2° pose tolerance is a placeholder until it's calibrated from same-session repeat photos with the noise band's recipe (2 × the gap's SD, rounded up). At about 1.3% per degree, ±5° would have let through ±6–7% of fake change.
- A user's first check-in under this method becomes the new baseline and pose reference; earlier check-ins are labelled "earlier method".
- Laptop webcams produce landscape frames, so the app's own camera capture only works on a phone held upright. Phones are the target, so this is accepted.

## Troubleshooting

- **A threshold that sounded sensible would have rejected good photos.** The 40% "too far" idea was checked against real photos before building, and a distance simulation set the line at 15% instead.
- **A mirror selfie passed the pose check.** Its arm angle was averaged over both arms. Checking each arm separately or their symmetry wouldn't have helped: relaxed arms differed by up to 10.6°, more than the selfie's 7.3°. The real cause was the phone hand at shoulder height joining the shoulder outline, so the fix is the hand-at-shoulder check.
- **Elbows at waist height in relaxed photos.** With arms hanging, elbows sit near the waist row, so the touching check counts only joints near waist height and close to the edge. Checked on seven real photos before it was written.
- **A body touching the frame edges may read low.** Both reference photos, where the body runs into the frame, read 3–5% lower than padded copies. Parked in the backlog for a real-photo test.
