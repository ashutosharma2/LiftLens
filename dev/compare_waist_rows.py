"""Which waist height gives the steadiest shoulder-to-waist ratio across repeat photos?

Repeat photos of an unchanged body (one session, re-standing between photos)
should all give the same ratio, so the measurement that wobbles least wins.
For each photo: shrink to 2048 px like the app, take the pose model's outline,
measure the shoulder outline and the waist outline at several heights (a
fraction of the way from the shoulder line to the hip line), and print each
measurement's spread (SD as % of the mean) and its correlation with arm angle.

Run from the repo root:  dev/.venv/bin/python dev/compare_waist_rows.py dev/fixtures/<session folder>
Photos stay in dev/fixtures/, which is gitignored.
"""
import sys, math, statistics as st
from pathlib import Path
import cv2, numpy as np, mediapipe as mp
from mediapipe.tasks import python as mpp
from mediapipe.tasks.python import vision
pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=mpp.BaseOptions(model_asset_path='dev/pose_landmarker_lite.task'), output_segmentation_masks=True))
def edges(row, cx):
    if not row[cx]: return None
    l = cx
    while l > 0 and row[l-1]: l -= 1
    r = cx
    while r < len(row)-1 and row[r+1]: r += 1
    return l, r
data = []
for path in sorted(p for p in Path(sys.argv[1]).iterdir() if p.suffix.lower() in {'.jpg', '.jpeg', '.png'}):
    bgr = cv2.imread(str(path)); h, w = bgr.shape[:2]; s = min(1, 2048/max(w, h))
    bgr = cv2.resize(bgr, (round(w*s), round(h*s)), interpolation=cv2.INTER_AREA); h, w = bgr.shape[:2]
    res = pose.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))))
    L = res.pose_landmarks[0]; m = res.segmentation_masks[0].numpy_view().squeeze() >= 0.5
    p = lambda i: (L[i].x*w, L[i].y*h)
    ang = lambda a, b: abs(math.degrees(math.atan2(p(b)[0]-p(a)[0], p(b)[1]-p(a)[1])))
    sy = (p(11)[1]+p(12)[1])/2; hy = (p(23)[1]+p(24)[1])/2; torso = hy - sy; cx = int((p(11)[0]+p(12)[0])/2)
    se = edges(m[int(sy)], cx)
    rec = {'angle': (ang(11,13)+ang(12,14))/2, 'shoulder/torso': (se[1]-se[0])/torso}
    for f in (0.40, 0.45, 0.50, 0.55, 0.60, 0.65):
        e = edges(m[int(sy + f*torso)], cx)
        rec[f'waist@{f:.2f}/torso'] = (e[1]-e[0])/torso if e else float('nan')
        rec[f'RATIO waist@{f:.2f}'] = (se[1]-se[0])/(e[1]-e[0]) if e else float('nan')
    data.append(rec)
angles = [d['angle'] for d in data]
print(f'{"measure (each ÷ torso length, or the ratio)":44} {"SD":>7} {"corr w/ angle":>14}')
for k in data[0]:
    if k == 'angle': continue
    v = [d[k] for d in data]
    if any(math.isnan(x) for x in v): print(f'{k:44} missing'); continue
    print(f'{k:44} {st.stdev(v)/st.fmean(v):7.2%} {st.correlation(angles, v):14.2f}   mean {st.fmean(v):.3f}')
