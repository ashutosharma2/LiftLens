# ADR-007: Take the body outline from the pose model; never compare across methods

- Status: Accepted
- Date: 2026-10-15

## Scenario

Every width LiftLens measures comes from a body outline: the app walks along one row of a person/background mask until it leaves the person ([ADR-004](004-scale-free-measurements.md)). The mask used to come from MediaPipe's `selfie_segmenter`, a second model next to the pose landmarker. Calibrating the noise threshold meant taking repeat photos in an ordinary room, and that's where it broke.

## Obstacle

1. **The outline merged furniture and arms into the body.** In a lived-in bedroom, photographed from about 2 m, the segmenter painted a black chair, dark bedding and the arms as part of the person. Three photos of the same body read 0.74, 1.06 and 0.80, against 1.78 in front of a plain wall. The segmenter is built for close-up video calls, where the person fills the frame.
2. **Even a "good" reference photo was wrong.** On front1.jpg (hands on hips) the segmenter filled the dark gap between forearm and waist, so the waist ran 35 px into the forearm. Its 1.784 matched front2's 1.785 by coincidence.
3. **Changing the outline changes the numbers.** Saved check-ins store pixel measurements, not photos ([ADR-005](005-store-ingredients-recompute-scores.md)), so they can't be re-measured. On front2.png the new outline reads about 2% lower, which is the size of the noise band. Comparing old and new check-ins would report changes that never happened.

## Action

The outline comes from the pose model itself. The pose landmarker can return its own segmentation mask (`outputSegmentationMasks`), and a pixel counts as the person when the model is at least 50% sure. That model is already loaded, so the selfie segmenter is no longer downloaded. The measuring maths stays the same; only the mask comes from somewhere else. This is method version `2026-10-posemask-v1`.

Two details came out of the first real upload. Photos are shrunk to at most 2,048 px on their long side when captured: the pose model works at 256 px internally, the ratio didn't change (1.898 at full size and at 2,048), and MediaPipe ran out of memory on 24-megapixel phone photos. The model runs on the GPU, because on the CPU tasks-vision 1.1.0 aborts when it returns the mask.

Scores never compare across methods. Each method version has its own baseline: the earliest `ok` check-in of that method. "Since your first photo" and "since last check-in" compare only check-ins of the same method. History shows the method of the most recent check-in; check-ins from earlier methods stay in the list, labelled and out of the trend. The API accepts new check-ins only with the current method, so an outdated app can't keep adding measurements made with the old ruler.

Alternatives considered:

- **Keep the segmenter; tell users to stand against a plain wall.** Cheapest, but most homes don't have a clear wall, and the furniture failures produced confident wrong numbers with no warning.
- **A multi-class segmenter or a larger model.** Possibly cleaner edges, but another download and slower on phones. The pose model's mask fixed every failure seen, at no extra cost.
- **Convert old check-ins with a correction factor.** The shift isn't constant (front1 moved +6%, front2 −2%), so any factor would be invented.
- **Hide or delete old check-ins.** Loses a record that really happened.

## Result

- On the three failing room photos, the pose model's outline read 1.77, 1.61 and 1.90 instead of 0.73, 1.08 and 0.64. Those photos weren't in the same pose, so their spread doesn't measure the noise.
- One model download instead of two.
- The noise threshold is calibrated on the method that ships.
- The rule "one baseline per method" applies to every future method change, such as the steadier ruler in the backlog.
- Existing users' history restarts its trend at their first check-in with the new method.

## Troubleshooting

- **Found by drawing the mask.** Guessing at causes (arms, distance, angle) didn't explain the bad numbers. Drawing the mask over the photo showed the furniture painted as the person within minutes.
- **The first real upload froze on "Finding your pose and outline".** Reproduced in a browser: on the CPU delegate MediaPipe aborted with `Check failed: 1 == ChannelSize() (1 vs. 4)` when returning the mask, and a 24-megapixel photo also exhausted its memory. Fixed with the GPU delegate and the 2,048 px cap, then checked with a 24 MP upload measured three times in a row.
- **The two reference photos disagree under the new outline** (1.893 vs 1.745). Zooming into front1's waist showed the new outline is right: the old one had filled the forearm gap. The photos use different poses, so pose consistency matters; it becomes a check for the capture guidance.
