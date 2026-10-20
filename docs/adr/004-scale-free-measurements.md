# ADR-004: Measurements are scale-free

- Status: Accepted
- Date: 2026-10-07

## Scenario

Porting the prototype (`dev/landmark_test.py`) to TypeScript was meant to be a straight translation. Reading every step closely turned up two problems with what it measured.

## Obstacle

1. **Mixed methods.** Shoulder width was the distance between the two shoulder *joint* landmarks, while waist width was measured *edge to edge* on the segmentation mask. The shoulder-to-waist ratio compared two different kinds of measurement, and it could not show deltoid growth: building the outer shoulder doesn't move the joints.
2. **Pixels, not centimetres.** A single photo shows shape, not size. Pixel widths change with camera distance and resolution, so "waist 640 px" means nothing on its own, and raw pixel widths can't be compared between photos.

## Action

Shoulders are measured edge to edge, like the waist: walk the mask row at the shoulder line outward from the torso centre. That way deltoid growth changes the number.

Because arms can join the outline at shoulder height (for example when raised), outer shoulder width is checked against joint width. On good front photos it measured 1.39 to 1.49 times the joint width. Outside 1.1 to 1.8 the measurement is flagged `too_wide` or `too_narrow`, so the photo-quality step can ask for a retake. The range is loose on purpose and should be tuned as more photos are measured.

There are no centimetres in V1. LiftLens reports:

- Ratios within one photo (shoulder-to-waist, shoulder-to-hip). Pixels cancel out, so these mean something as they are.
- Indexes for change over time: shoulder width and waist width divided by hip joint width. Hip bones don't change with training or diet, so the hip joints act as a ruler present in every photo, and the indexes stay comparable between photos taken at different distances.

Pixel widths are kept only for drawing the overlay and as stored ingredients ([ADR-005](005-store-ingredients-recompute-scores.md)); they are never shown as sizes.

Alternatives considered:

- **Both widths joint to joint (shoulder-to-hip only).** Stable, but hip joints barely change with fat loss or muscle gain, so progress wouldn't show.
- **Keep mixed methods as a "LiftLens index".** No new code, but deltoid growth stays invisible.
- **Centimetres from the user's height.** Gives real sizes, but needs the whole body in frame and an extra input that users may get wrong.
- **Centimetres from a reference object (e.g. an A4 sheet).** Accurate when placed correctly, but awkward for users.

## Result

- Users enter nothing extra: no height, no reference object.
- No absolute sizes ("42 cm") in V1.
- Two photos of the same body gave shoulder-to-waist ratios of 1.784 and 1.785.
- The indexes depend on the hip landmarks, the least precise of the four used, so for V1 only shoulder-to-waist is scored ([scoring](../scoring.md)).

## Troubleshooting

- **Arms at shoulder height.** The worry was that the shoulder walk would run into the arms. Measuring real photos showed the outline at the shoulder line is always continuous with the arms (that edge *is* the deltoid), so the walk is valid; raised arms are what the 1.1 to 1.8 check catches.
- **The ruler was noisier than estimated.** I first assumed the hip-normalised indexes would vary about 3% between photos. Two photos of the same body in the same session gave shoulder indexes of 2.83 and 2.51, about 11% apart, while the ratio barely moved. The real figure is recorded here, the score uses the steady ratio, and a calibration task and a "steadier ruler" task are in BACKLOG.md.
- **Port first, then change.** The port reproduced the prototype exactly before either fix was made, and the Python reference was then updated alongside, so porting bugs and design changes could never be confused.
