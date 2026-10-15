# Next session — ONE task

**M3 step 3 — Test the measuring step with a real photo**
The measuring step is built (69aa52f). Sign in to the local app, upload dev/fixtures/front2.png, and check the result is about 1.78–1.79 (the Python reference gives 1.785) with the shoulder and waist lines in the right places. Saving it is optional: it would be a second real check-in.

Still open:
- Change the Cognito password (it appeared in a screenshot during M2's smoke test).
- Confirm the camera light goes off as soon as the photo is taken.
- Right after step 3, before M4: calibrate the noise threshold (BACKLOG) — ~5 front photos in one session, set NOISE_THRESHOLD to about 2× their spread, update docs/scoring.md. Every "no clear change" depends on it.
- M4: host the MediaPipe runtime and model files on S3 + CloudFront (today they're copied into public/ for local dev only).

Done when: a photo taken in the local app is measured and saved, and the new result appears on History.

## End of every milestone
- Update README.md (status table, key decisions) and docs/architecture.md (all diagrams; solid = built, dashed = planned).
- Update docs/project-story.md: new actions, results and every real error hit (problem, cause, fix, lesson).
- Commit, add one line to LOG.md, set the next single task here.
