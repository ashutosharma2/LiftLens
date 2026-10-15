"""Turn repeat shoulder-to-waist ratios into a noise threshold.

Take repeat front photos of an unchanged body in one session (walk away,
re-stand and re-prop the phone between each), read each ratio from the local
app to 3 decimals, then run from the repo root:

    python3 dev/noise.py 1.783 1.771 1.790 ...

The rule (see docs/scoring.md):
- wobble of one photo = sample standard deviation, as a fraction of the average
- a change compares two photos, so its wobble is sqrt(2) times larger
- threshold = 2 x that, rounded up to the nearest 0.1%
"""

import math
import statistics
import sys

MARGIN = 2  # how many gap wobbles a change must exceed
RECOMMENDED_PHOTOS = 10


def threshold(ratios: list[float]) -> dict[str, float]:
    if len(ratios) < 2:
        raise ValueError("need at least 2 ratios")
    mean = statistics.fmean(ratios)
    sd = statistics.stdev(ratios) / mean  # divides by n - 1
    gap_sd = sd * math.sqrt(2)
    raw = MARGIN * gap_sd
    # round() first so float fuzz (0.0250000001) doesn't round up a whole step
    rounded_up = math.ceil(round(raw * 1000, 6)) / 1000
    return {"mean": mean, "sd": sd, "gap_sd": gap_sd, "raw": raw, "threshold": rounded_up}


def main(args: list[str]) -> None:
    ratios = [float(a) for a in args]
    r = threshold(ratios)
    print(f"photos:          {len(ratios)}")
    print(f"range:           {min(ratios):.3f} – {max(ratios):.3f}")
    print(f"average:         {r['mean']:.4f}")
    print(f"one photo SD:    {r['sd']:.2%}")
    print(f"gap SD (x1.41):  {r['gap_sd']:.2%}")
    print(f"2 x gap SD:      {r['raw']:.2%}")
    print(f"NOISE_THRESHOLD: {r['threshold']:.3f}  (±{r['threshold']:.1%})")
    if len(ratios) < RECOMMENDED_PHOTOS:
        print(f"note: fewer than {RECOMMENDED_PHOTOS} photos; the SD estimate is rough")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("usage: python3 dev/noise.py RATIO RATIO [RATIO ...]")
    main(sys.argv[1:])
