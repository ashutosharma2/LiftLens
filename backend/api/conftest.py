"""Shared fakes for the API tests: a throwaway RSA key pair, token factory, store and clock."""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

# The Lambda package puts score.py next to these modules; mirror that for tests.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scoring"))

ISSUER = "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_TEST"
CLIENT_ID = "test-client"
KID = "test-key"
NOW = datetime(2026, 10, 10, 9, 30, tzinfo=timezone.utc)


def new_private_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="session")
def private_key():
    return new_private_key()


@pytest.fixture(scope="session")
def key_lookup(private_key):
    public = private_key.public_key()
    return lambda kid: public if kid == KID else None


@pytest.fixture(scope="session")
def make_token(private_key):
    def make(key=None, kid=KID, **overrides):
        claims = {
            "sub": "user-1",
            "iss": ISSUER,
            "aud": CLIENT_ID,
            "token_use": "id",
            "exp": int((NOW + timedelta(hours=1)).timestamp()),
        }
        claims.update(overrides)
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, key or private_key, algorithm="RS256", headers={"kid": kid})

    return make


class FakeStore:
    def __init__(self):
        self.items: list[dict] = []

    def put(self, card: dict) -> None:
        self.items.append(dict(card))

    def list_for_user(self, user_id: str) -> list[dict]:
        return sorted((dict(i) for i in self.items if i["userId"] == user_id), key=lambda i: i["timestamp"])


class FakeClock:
    def __init__(self, start=NOW):
        self.current = start

    def __call__(self) -> datetime:
        return self.current

    def advance(self, **delta) -> None:
        self.current += timedelta(**delta)


@pytest.fixture
def store():
    return FakeStore()


@pytest.fixture
def clock():
    return FakeClock()


def ingredients(**overrides):
    body = {
        "shoulderEdgePx": 1029,
        "waistEdgePx": 577,
        "shoulderJointPx": 690,
        "hipJointPx": 364,
        "torsoLengthPx": 905,
        "armAngleDeg": 20.5,
        "methodVersion": "2026-10-posemask-v2",
    }
    body.update(overrides)
    return {k: v for k, v in body.items() if v is not None}


def body_json(**overrides) -> str:
    return json.dumps(ingredients(**overrides))
