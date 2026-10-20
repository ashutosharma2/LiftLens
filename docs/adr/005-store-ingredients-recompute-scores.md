# ADR-005: Store measurement ingredients, recompute scores

- Status: Accepted
- Date: 2026-10-10

## Scenario

Designing the DynamoDB item for a measurement: which numbers to keep, and whether to store each score or work it out on demand.

## Obstacle

Photos never leave the user's device ([ADR-002](002-pose-extraction-in-browser.md)). Once a check-in is over, the photo is gone, so any number not saved that day can never be calculated later.

At the same time, the measurement and scoring rules are still young:

- The hip-joint "ruler" behind the indexes varies by about 11% between photos of the same body ([ADR-004](004-scale-free-measurements.md)); a steadier ruler may replace it.
- The ±2% noise threshold is a placeholder awaiting calibration ([scoring](../scoring.md)).
- `maths.ts` may get bug fixes.

## Action

Store the ingredients. Along with the shoulder-to-waist ratio, each measurement keeps the pixel values from that photo that any future ratio could be built from: outer shoulder width, waist width, shoulder joint width, hip joint width and torso length. Pixel values are meaningless *between* photos but exact *within* one, so ratios built from them later are valid for old photos too. They are never shown to users.

Each item also records `methodVersion`, the version of the measurement maths that produced its numbers, so results from different versions can be told apart or recomputed.

Recompute scores on every read. Scores and their explanations are never stored. Each request reads the user's items and scores them with the current rules.

Keep flagged photos. A measurement whose shoulder outline looks implausible is saved with its `shoulderCheck`, shown greyed out, and excluded from the baseline and from progress, so the history stays complete.

Alternatives considered:

- **Store only the ratio.** Smallest item, but nothing invented later can be applied to past photos, because the photos are gone.
- **Store the score with each item.** Explanations never change, but old items keep outdated thresholds and formulas forever.
- **Reject flagged photos.** Every stored item would be reliable, but gaps would appear in the history with no record of why.

## Result

- A better ruler or formula improves every past measurement, not just new ones; a calibrated noise threshold applies to the whole history at once.
- Items are a little larger (five extra numbers, a few bytes each).
- A user's explanation for an old photo can change wording when the rules change. That's on purpose, so it always reflects the current rules.
- Every read scores every item. At about one item per user per week that costs next to nothing. If histories grow very large, add pagination or a cached baseline.

## Troubleshooting

- **The first draft dropped the pixel widths.** Following ADR-004 ("pixels are meaningless"), the first version of the data model discarded pixel widths. Working through "how could we fix the noisy ruler later?" showed the flaw: a fix could only apply to new photos, because the old photos are gone. What settled it: pixels are meaningless *between* photos but exact *within* one, so they're kept as ingredients and never shown.
