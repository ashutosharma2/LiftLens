import json

import pytest

from conftest import body_json, ingredients
from errors import ApiError
from validation import MAX_BODY_BYTES, parse_body


def error_of(raw):
    with pytest.raises(ApiError) as err:
        parse_body(raw)
    return err.value


def test_valid_body_is_parsed():
    ing = parse_body(body_json())
    assert ing.shoulder_edge_px == 1029.0
    assert ing.method_version == "2026-10-posemask-v2"


def test_body_over_2kb_is_413():
    raw = json.dumps({**ingredients(), "pad": "x" * MAX_BODY_BYTES})
    assert error_of(raw).status == 413


@pytest.mark.parametrize("raw", [None, "", "not json", "[1, 2]", "42"])
def test_missing_or_non_object_body_is_400(raw):
    assert error_of(raw).status == 400


def test_missing_field_is_named():
    err = error_of(body_json(waistEdgePx=None))
    assert (err.status, err.message) == (400, "Missing field: waistEdgePx")


def test_unknown_field_is_rejected():
    err = error_of(json.dumps({**ingredients(), "userId": "someone-else"}))
    assert (err.status, err.message) == (400, "Unknown field: userId")


def test_client_cannot_send_its_own_ratio():
    err = error_of(json.dumps({**ingredients(), "shoulderToWaist": 9.9}))
    assert err.message == "Unknown field: shoulderToWaist"


@pytest.mark.parametrize("bad", [0, 0.5, 10_001, -3, float("inf"), "1029", None, True])
def test_pixel_values_must_be_numbers_in_range(bad):
    raw = json.dumps({**ingredients(), "hipJointPx": bad}) if bad is not None else body_json(hipJointPx=None)
    err = error_of(raw)
    assert err.status == 400
    assert "hipJointPx" in err.message


@pytest.mark.parametrize("version", ["2026-10-posemask-v1", "2026-10-edge-v1", "2020-01-old", "", 1])
def test_method_version_must_be_known(version):
    err = error_of(body_json(methodVersion=version))
    assert err.message == "methodVersion is not a known version"


@pytest.mark.parametrize("shoulder,waist", [(500, 1000), (3100, 1000)])
def test_ratio_must_be_plausible(shoulder, waist):
    err = error_of(body_json(shoulderEdgePx=shoulder, waistEdgePx=waist))
    assert err.status == 400
    assert "between 0.8 and 3.0" in err.message


@pytest.mark.parametrize("angle", [-1, 90.5, True, "20", float("nan")])
def test_arm_angle_must_be_a_plausible_number(angle):
    err = error_of(body_json(armAngleDeg=angle))  # json.dumps writes NaN, which json.loads accepts
    assert err.message == "armAngleDeg must be a number between 0 and 90"


def test_arm_angle_is_required():
    err = error_of(body_json(armAngleDeg=None))
    assert err.message == "Missing field: armAngleDeg"
