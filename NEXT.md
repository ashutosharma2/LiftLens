# Next session — ONE task

**Validate the 55% waist row on a fresh session, then set the method and both thresholds**
Eleven repeat photos (2026-10-17) showed the waist row at 65% sits on the shorts' waistband and drives most of the wobble; at 55% the ratio's SD fell from 3.58% to 1.13%. That height was picked from six on the same photos, so it has to be confirmed on photos it has never seen.

1. Another day: take 10 relaxed-pose front photos in one session (same spot, light and clothes; phone propped with the timer; step away and come back between photos). Copy the originals into `dev/fixtures/calib-<date>/`.
2. Run `dev/.venv/bin/python dev/compare_waist_rows.py dev/fixtures/calib-<date>`.
3. If 55% is still clearly steadier than 65%: move the waist to 55% in the app (`WAIST_FRACTION` in frontend/src/measure/maths.ts) and the Python reference, still as method `2026-10-posemask-v2` (never deployed), then set NOISE_THRESHOLD and POSE_TOLERANCE_DEG from the same session (2 × the gap SD, rounded up). If not, keep 65% and widen the noise band.
4. Deploy the API once (plan shown first); the first saved check-in becomes the new baseline and pose reference.

Still open:
- BACKLOG: side-on photos, flexed poses, body touching the frame edges, back photos as a feature.
- System-design doc + free CloudWatch alarms, then M4 (which also makes the app usable on a phone).

Done when: the waist height is chosen from fresh evidence, both thresholds come from the same session, and the API is deployed.

## End of every milestone
- Update README.md (status table, key decisions) and docs/architecture.md (all diagrams; solid = built, dashed = planned).
- Update docs/project-story.md: new actions, results and every real error hit (problem, cause, fix, lesson).
- Commit, add one line to LOG.md, set the next single task here.
