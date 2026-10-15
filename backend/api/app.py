"""Lambda entry point for the measurements API (Lambda Function URL events).

Routes POST and GET /api/measurements. The outside world (token keys, clock,
DynamoDB) is passed in through Deps, so tests run the same code with fakes.
"""

import base64
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from auth import JwksCache, verify_token
from errors import ApiError
from measurements import build_card, public_card, score_dict, score_history, since_previous
from score import NOISE_THRESHOLD
from store import DynamoStore, MeasurementStore
from validation import parse_body

logger = logging.getLogger()
logger.setLevel(logging.INFO)

PATH = "/api/measurements"


@dataclass
class Deps:
    store: MeasurementStore
    verify: Callable[[str], str]  # token -> user ID, or raises ApiError(401)
    now: Callable[[], datetime]


def _response(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def _bearer_token(event: dict) -> str:
    header = (event.get("headers") or {}).get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "Missing bearer token")
    return token


def _body(event: dict) -> str | None:
    body = event.get("body")
    if body is not None and event.get("isBase64Encoded"):
        try:
            body = base64.b64decode(body).decode("utf-8")
        except ValueError:
            raise ApiError(400, "Body must be valid JSON")
    return body


def _timestamp(now: datetime) -> str:
    # Millisecond precision so two saves in the same second don't collide.
    return now.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _post(event: dict, user_id: str, deps: Deps) -> dict:
    ingredients = parse_body(_body(event))
    card = build_card(user_id, _timestamp(deps.now()), ingredients)
    deps.store.put(card)

    cards = deps.store.list_for_user(user_id)
    history = score_history(cards)
    result = next(r for c, r in history.items if c["timestamp"] == card["timestamp"])
    since = since_previous(cards).get(card["timestamp"])
    return _response(
        201,
        {
            "measurement": public_card(card, card["timestamp"] in history.baseline_timestamps),
            "score": score_dict(result),
            "sinceLast": score_dict(since) if since else None,
        },
    )


def _get(user_id: str, deps: Deps) -> dict:
    cards = deps.store.list_for_user(user_id)
    history = score_history(cards)
    since = since_previous(cards)
    measurements = [
        {
            **public_card(card, card["timestamp"] in history.baseline_timestamps),
            "score": score_dict(result),
            "sinceLast": score_dict(since[card["timestamp"]]) if card["timestamp"] in since else None,
        }
        for card, result in history.items
    ]
    return _response(
        200,
        {
            "currentMethodVersion": history.current_method,
            "baselineTimestamp": history.baseline_timestamp,
            "noiseThreshold": NOISE_THRESHOLD,
            "measurements": measurements,
        },
    )


def route(event: dict, deps: Deps) -> dict:
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "")
        if event.get("rawPath") != PATH:
            raise ApiError(404, "Not found")
        if method not in ("GET", "POST"):
            raise ApiError(405, "Method not allowed")

        user_id = deps.verify(_bearer_token(event))
        return _post(event, user_id, deps) if method == "POST" else _get(user_id, deps)
    except ApiError as err:
        return _response(err.status, {"error": err.message})
    except Exception:
        logger.exception("Unhandled error")
        return _response(500, {"error": "Internal error"})


_deps: Deps | None = None


def _real_deps() -> Deps:
    issuer = os.environ["COGNITO_ISSUER"]
    client_id = os.environ["COGNITO_CLIENT_ID"]
    clock = lambda: datetime.now(timezone.utc)  # noqa: E731
    keys = JwksCache(f"{issuer}/.well-known/jwks.json", clock=lambda: clock().timestamp())
    return Deps(
        store=DynamoStore(os.environ["TABLE_NAME"]),
        verify=lambda token: verify_token(token, keys.lookup, issuer, client_id, clock().timestamp()),
        now=clock,
    )


def handler(event: dict, context) -> dict:
    global _deps
    if _deps is None:
        _deps = _real_deps()  # built once per warm Lambda, so keys stay cached
    return route(event, _deps)
