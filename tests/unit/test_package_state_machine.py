"""Unit tests for the package lifecycle state machine."""
import pytest

from app.models.enums import PackageStatus
from app.state_machine.package_state_machine import (
    InvalidTransitionError,
    assert_valid_transition,
    is_terminal,
    is_valid_transition,
    next_possible_statuses,
)


def test_happy_path_is_fully_valid():
    happy_path = [
        PackageStatus.PACKAGE_CREATED,
        PackageStatus.PICKUP_ASSIGNED,
        PackageStatus.PICKED_UP,
        PackageStatus.ARRIVED_AT_HUB,
        PackageStatus.SORTING,
        PackageStatus.DISPATCHED,
        PackageStatus.IN_TRANSIT,
        PackageStatus.ARRIVED_AT_DESTINATION_HUB,
        PackageStatus.OUT_FOR_DELIVERY,
        PackageStatus.DELIVERED,
    ]
    for current, nxt in zip(happy_path, happy_path[1:]):
        assert is_valid_transition(current, nxt), f"{current} -> {nxt} should be valid"


def test_cannot_skip_states():
    assert not is_valid_transition(PackageStatus.PACKAGE_CREATED, PackageStatus.DELIVERED)
    assert not is_valid_transition(PackageStatus.PACKAGE_CREATED, PackageStatus.IN_TRANSIT)


def test_cannot_leave_terminal_states():
    assert is_terminal(PackageStatus.DELIVERED)
    assert is_terminal(PackageStatus.CANCELLED)
    assert is_terminal(PackageStatus.RETURNED)
    assert next_possible_statuses(PackageStatus.DELIVERED) == set()


def test_assert_valid_transition_raises_on_illegal_move():
    with pytest.raises(InvalidTransitionError):
        assert_valid_transition(PackageStatus.DELIVERED, PackageStatus.IN_TRANSIT)


def test_cancellation_only_allowed_before_pickup():
    assert is_valid_transition(PackageStatus.PACKAGE_CREATED, PackageStatus.CANCELLED)
    assert is_valid_transition(PackageStatus.PICKUP_ASSIGNED, PackageStatus.CANCELLED)
    assert not is_valid_transition(PackageStatus.IN_TRANSIT, PackageStatus.CANCELLED)


def test_delivery_failure_and_return_branch():
    assert is_valid_transition(PackageStatus.OUT_FOR_DELIVERY, PackageStatus.DELIVERY_FAILED)
    assert is_valid_transition(PackageStatus.DELIVERY_FAILED, PackageStatus.RETURN_REQUESTED)
    assert is_valid_transition(PackageStatus.RETURN_REQUESTED, PackageStatus.RETURN_IN_TRANSIT)
    assert is_valid_transition(PackageStatus.RETURN_IN_TRANSIT, PackageStatus.RETURNED)
    assert is_terminal(PackageStatus.RETURNED)
