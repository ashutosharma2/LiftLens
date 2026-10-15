"""End-to-end through route(): real auth, validation and scoring; fake store, keys and clock."""

import base64
import json

from datetime import timedelta

import pytest

from app import Deps, route
from auth import verify_token
from conftest import CLIENT_ID, ISSUER, body_json
from score import NOISE_THRESHOLD


@pytest.fixture
def deps(store, clock, key_lookup):
    return Deps(
        store=store,
        verify=lambda token: verify_token(token, key_lookup, ISSUER, CLIENT_ID, clock().timestamp()),
        now=clock,
    )


def event(method="GET", path="/api/measurements", token=None, body=None, b64=False):
    headers = {"authorization": f"Bearer {token}"} if token else {}
    if body is not None and b64:
        body = base64.b64encode(body.encode()).decode()
    return {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "headers": headers,
        "body": body,
        "isBase64Encoded": b64,
    }


def fresh(make_token, clock, **claims):
    """A token valid for an hour from the fake clock's current time."""
    return make_token(exp=int((clock() + timedelta(hours=1)).timestamp()), **claims)


def call(deps, **kwargs):
    response = route(event(**kwargs), deps)
    return response["statusCode"], json.loads(response["body"])


def test_post_saves_and_returns_the_first_photo_as_baseline(deps, store, make_token):
    status, body = call(deps, method="POST", token=make_token(), body=body_json())
    assert status == 201
    assert body["sinceLast"] is None
    assert body["measurement"]["isBaseline"] is True
    assert body["measurement"]["timestamp"] == "2026-10-10T09:30:00.000Z"
    assert body["score"]["status"] == "baseline"
    assert store.items[0]["userId"] == "user-1"
    assert "shoulderEdgePx" not in body["measurement"]


def test_second_post_reports_progress(deps, clock, make_token):
    call(deps, method="POST", token=make_token(), body=body_json(shoulderEdgePx=1000, waistEdgePx=588))  # 1.70
    clock.advance(days=7)
    status, body = call(
        deps, method="POST", token=fresh(make_token, clock), body=body_json(shoulderEdgePx=1068, waistEdgePx=600)
    )  # 1.78
    assert status == 201
    assert body["score"]["status"] == "increased"
    assert "rose 4.7%" in body["score"]["explanation"]
    assert body["sinceLast"]["status"] == "increased"
    assert "since your previous check-in" in body["sinceLast"]["explanation"]


def test_get_returns_history_with_scores_oldest_first(deps, clock, make_token):
    call(deps, method="POST", token=make_token(), body=body_json(shoulderJointPx=500))  # too_wide: flagged
    clock.advance(days=7)
    call(deps, method="POST", token=fresh(make_token, clock), body=body_json())
    status, body = call(deps, token=fresh(make_token, clock))
    assert status == 200
    assert [m["score"]["status"] for m in body["measurements"]] == ["flagged", "baseline"]
    assert body["baselineTimestamp"] == body["measurements"][1]["timestamp"]
    assert [m["sinceLast"] for m in body["measurements"]] == [None, None]
    assert body["noiseThreshold"] == NOISE_THRESHOLD


def test_users_only_see_their_own_history(deps, make_token):
    call(deps, method="POST", token=make_token(sub="alice"), body=body_json())
    status, body = call(deps, token=make_token(sub="bob"))
    assert status == 200
    assert body == {"baselineTimestamp": None, "noiseThreshold": NOISE_THRESHOLD, "measurements": []}


def test_base64_bodies_are_decoded(deps, make_token):
    status, _ = call(deps, method="POST", token=make_token(), body=body_json(), b64=True)
    assert status == 201


@pytest.mark.parametrize(
    "kwargs,status",
    [
        ({"token": None}, 401),
        ({"token": "garbage"}, 401),
        ({"path": "/api/other"}, 404),
        ({"method": "DELETE"}, 405),
        ({"method": "POST", "body": "{}"}, 400),
        ({"method": "POST", "body": "x" * 3000}, 413),
    ],
    ids=["no-token", "bad-token", "unknown-path", "wrong-method", "invalid-body", "too-big"],
)
def test_error_statuses(deps, make_token, kwargs, status):
    kwargs = {"token": make_token(), **kwargs}
    got, body = call(deps, **kwargs)
    assert got == status
    assert "error" in body


def test_expired_token_is_401(deps, clock, make_token):
    token = make_token()
    clock.advance(hours=2)
    assert call(deps, token=token)[0] == 401


def test_unexpected_errors_are_500_without_details(deps, make_token):
    class BrokenStore:
        def put(self, card):
            raise RuntimeError("secret internal detail")

        def list_for_user(self, user_id):
            raise RuntimeError("secret internal detail")

    deps.store = BrokenStore()
    status, body = call(deps, token=make_token())
    assert status == 500
    assert body == {"error": "Internal error"}
