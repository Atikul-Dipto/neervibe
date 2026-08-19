"""Enforces valid package status transitions. The single source of truth for
what state changes are legal — services must go through this, never set
`Package.current_status` directly.
"""
from app.models.enums import PACKAGE_STATUS_TRANSITIONS, PackageStatus


class InvalidTransitionError(Exception):
    def __init__(self, current: PackageStatus, target: PackageStatus):
        self.current = current
        self.target = target
        super().__init__(f"Cannot transition package from {current} to {target}")


def is_valid_transition(current: PackageStatus, target: PackageStatus) -> bool:
    return target in PACKAGE_STATUS_TRANSITIONS.get(current, set())


def assert_valid_transition(current: PackageStatus, target: PackageStatus) -> None:
    if not is_valid_transition(current, target):
        raise InvalidTransitionError(current, target)


def next_possible_statuses(current: PackageStatus) -> set[PackageStatus]:
    return PACKAGE_STATUS_TRANSITIONS.get(current, set())


def is_terminal(status: PackageStatus) -> bool:
    return len(PACKAGE_STATUS_TRANSITIONS.get(status, set())) == 0
