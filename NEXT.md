# Next session — ONE task

**Design the catch-and-guide checks for the capture step**
Measuring now survives cluttered rooms (ADR-007) and the noise threshold is calibrated (±2.4%), but the app still accepts photos it can't measure meaningfully. Decide, for each problem seen during calibration, how the app notices it (photo shape, body size in the frame, wrist/elbow positions vs the waist edges, face visibility) and what it tells the user, and whether each is a retake or a flag:
- phone sideways (landscape photo)
- too far away (body small in the frame)
- arms or hands touching the waist (waist edges reach the wrists)
- back photo taken as a front one (until back photos are a feature, see BACKLOG)
- pose differs from the usual one (hands on hips, flexing)

Still open:
- Change the Cognito password (it appeared in a screenshot during M2's smoke test).
- Back photos with their own baseline (BACKLOG): how the view is known, waist from behind, separate calibration.
- System-design doc (NFRs, failure modes, threat model) + free CloudWatch alarms, then M4.

Done when: each check has a rule, a message and retake/flag decided, is implemented with tests, and a sideways, a far-away and an arms-touching photo each get the right message.

## End of every milestone
- Update README.md (status table, key decisions) and docs/architecture.md (all diagrams; solid = built, dashed = planned).
- Update docs/project-story.md: new actions, results and every real error hit (problem, cause, fix, lesson).
- Commit, add one line to LOG.md, set the next single task here.
