# Next session — ONE task

**Calibrate the noise threshold**
The ±2% band that decides "no clear change" is a placeholder. Take repeat front photos in one session where the body can't change — stepping away, re-standing and re-propping the phone between each, like a real weekly check-in — measure each in the local app (Retake, don't Save), and set NOISE_THRESHOLD in backend/scoring/score.py from their spread. Update docs/scoring.md, the tests, and redeploy the API (plan shown first).

Still open:
- Change the Cognito password (it appeared in a screenshot during M2's smoke test).
- After calibration: system-design doc (NFRs, failure modes, threat model) + free CloudWatch alarms, then M4.
- M4: host the MediaPipe runtime and model files on S3 + CloudFront (today they're copied into public/ for local dev only).

Done when: NOISE_THRESHOLD is set from measured repeat photos, the reasoning is in docs/scoring.md, and the deployed API returns the new noiseThreshold.

## End of every milestone
- Update README.md (status table, key decisions) and docs/architecture.md (all diagrams; solid = built, dashed = planned).
- Update docs/project-story.md: new actions, results and every real error hit (problem, cause, fix, lesson).
- Commit, add one line to LOG.md, set the next single task here.
