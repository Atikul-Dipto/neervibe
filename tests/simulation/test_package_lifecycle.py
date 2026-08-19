"""Simulation-level test: verifies a package can legally walk the full
lifecycle from creation to delivery, and that the branch paths used by
scripts/generate_dummy_events.py stay valid against the state machine.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from generate_dummy_events import HAPPY_PATH, build_path

from app.models.enums import PackageStatus
from app.state_machine.package_state_machine import is_valid_transition


def _assert_path_is_legal(path: list[PackageStatus]) -> None:
    assert path[0] == PackageStatus.PACKAGE_CREATED
    for current, nxt in zip(path, path[1:]):
        assert is_valid_transition(current, nxt), f"illegal transition {current} -> {nxt}"


def test_happy_path_end_to_end():
    _assert_path_is_legal(HAPPY_PATH)
    assert HAPPY_PATH[-1] == PackageStatus.DELIVERED


def test_every_terminal_status_has_a_legal_path():
    terminal_statuses = [
        PackageStatus.DELIVERED,
        PackageStatus.CANCELLED,
        PackageStatus.LOST,
        PackageStatus.DAMAGED,
        PackageStatus.DELIVERY_FAILED,
        PackageStatus.RESCHEDULED,
        PackageStatus.RETURN_REQUESTED,
        PackageStatus.RETURN_IN_TRANSIT,
        PackageStatus.RETURNED,
    ]
    for status in terminal_statuses:
        path = build_path(status)
        _assert_path_is_legal(path)
        assert path[-1] == status
