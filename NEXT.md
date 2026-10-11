# Next session — ONE task

**M3 step 3 — Measure the photo**
Run the pose and segmentation models on the check-in photo in the browser, turn the result into the measurement ingredients, and show the shoulder-to-waist result with an explicit Save that posts it to the API. A bad photo (nobody found, shoulders/hips missing, shoulderCheck flagged) shows what went wrong and offers a retake. Design first: what does the person see while the models load and run, and what counts as a photo too bad to save?

Still open:
- History UI polish is done (trend chart, change since last check-in, body map); continue with step 3 from here.
- Change the Cognito password (it appeared in a screenshot during M2's smoke test).
- Confirm models.ts works in a real browser and that the segmenter's person value is 0.
- Confirm the camera light goes off as soon as the photo is taken.
- Right after step 3, before M4: calibrate the noise threshold (BACKLOG) — ~5 front photos in one session, set NOISE_THRESHOLD to about 2× their spread, update docs/scoring.md. Every "no clear change" depends on it.

Done when: a photo taken in the local app is measured and saved, and the new result appears on History.

## End of every milestone
- Update README.md: status table, architecture diagram (solid = built, dashed = planned), key decisions.
- Update docs/project-story.md: new actions, results and every real error hit (problem, cause, fix, lesson).
- Commit, add one line to LOG.md, set the next single task here.
