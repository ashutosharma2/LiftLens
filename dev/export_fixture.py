"""Export reference numbers for the TypeScript measurement port.

For each photo in dev/fixtures/, run the measurement logic (based on
dev/landmark_test.py, with shoulders measured edge to edge like the waist)
and save landmarks, the shoulder and waist mask rows and the resulting measurements to
dev/fixtures/<name>.parity.json. frontend/src/measure/maths.parity.test.ts
feeds the same inputs into maths.ts and checks the numbers match.

Run from the repo root:  dev/.venv/bin/python dev/export_fixture.py
Outputs stay in dev/fixtures/, which is gitignored.
"""

import json
from pathlib import Path

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

FIXTURES = Path("dev/fixtures")
POSE_MODEL = "dev/pose_landmarker_lite.task"
SEGMENTER_MODEL = "dev/selfie_segmenter.tflite"
PERSON_VALUE = 0  # as found in the prototype
LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP = 11, 12, 23, 24
WAIST_FRACTION = 0.65


def to_px(lm, w, h):
    return lm.x * w, lm.y * h


def distance(p1, p2):
    return ((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5


def walk_edges(row, center_x):
    left = center_x
    while left > 0 and row[left] == PERSON_VALUE:
        left -= 1
    left += 1
    right = center_x
    while right < len(row) - 1 and row[right] == PERSON_VALUE:
        right += 1
    right -= 1
    return left, right


def export(image_path, landmarker, segmenter):
    image = mp.Image.create_from_file(str(image_path))
    w, h = image.width, image.height

    pose = landmarker.detect(image)
    if not pose.pose_landmarks:
        print(f"{image_path.name}: no person detected, skipped")
        return
    landmarks = pose.pose_landmarks[0]

    ls = to_px(landmarks[LEFT_SHOULDER], w, h)
    rs = to_px(landmarks[RIGHT_SHOULDER], w, h)
    lh = to_px(landmarks[LEFT_HIP], w, h)
    rh = to_px(landmarks[RIGHT_HIP], w, h)
    shoulder_joint_width = distance(ls, rs)
    hip_width = distance(lh, rh)
    torso_length = distance(((ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2), ((lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2))

    # The mask may come back as (h, w, 1); drop the channel axis.
    mask = segmenter.segment(image).category_mask.numpy_view().squeeze()
    shoulder_mid_y = (ls[1] + rs[1]) / 2
    hip_mid_y = (lh[1] + rh[1]) / 2
    waist_y = int(shoulder_mid_y + WAIST_FRACTION * (hip_mid_y - shoulder_mid_y))
    center_x = int((ls[0] + rs[0]) / 2)
    row = mask[waist_y, :]
    left, right = walk_edges(row, center_x)
    waist_width = right - left

    # Outer shoulder width: same edge walk on the shoulder-line row.
    shoulder_y = int(shoulder_mid_y)
    shoulder_row = mask[shoulder_y, :]
    s_left, s_right = walk_edges(shoulder_row, center_x)
    shoulder_width = s_right - s_left

    out = {
        "image": image_path.name,
        "width": w,
        "height": h,
        "person_value": PERSON_VALUE,
        "landmarks": [{"x": lm.x, "y": lm.y, "visibility": lm.visibility} for lm in landmarks],
        "waist_mask_row": [int(v) for v in row],
        "shoulder_mask_row": [int(v) for v in shoulder_row],
        "python": {
            "shoulder_width_px": shoulder_width,
            "shoulder_joint_width_px": shoulder_joint_width,
            "shoulder_y": shoulder_y,
            "shoulder_left": s_left,
            "shoulder_right": s_right,
            "hip_width_px": hip_width,
            "shoulder_to_hip": shoulder_joint_width / hip_width,
            "waist_y": waist_y,
            "waist_left": left,
            "waist_right": right,
            "waist_width_px": waist_width,
            "shoulder_to_waist": shoulder_width / waist_width,
            "shoulder_index": shoulder_width / hip_width,
            "waist_index": waist_width / hip_width,
            "torso_length_px": torso_length,
        },
    }
    out_path = FIXTURES / f"{image_path.stem}.parity.json"
    out_path.write_text(json.dumps(out))
    print(f"{image_path.name}: wrote {out_path.name} (shoulder/waist {out['python']['shoulder_to_waist']:.3f})")


def main():
    landmarker = vision.PoseLandmarker.create_from_options(
        vision.PoseLandmarkerOptions(base_options=mp_python.BaseOptions(model_asset_path=POSE_MODEL))
    )
    segmenter = vision.ImageSegmenter.create_from_options(
        vision.ImageSegmenterOptions(
            base_options=mp_python.BaseOptions(model_asset_path=SEGMENTER_MODEL),
            output_category_mask=True,
        )
    )
    photos = [
        p for p in sorted(FIXTURES.iterdir())
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"} and "_mask" not in p.stem and "_check" not in p.stem
    ]
    for photo in photos:
        export(photo, landmarker, segmenter)


if __name__ == "__main__":
    main()
