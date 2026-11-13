"""Pytest configuration for Ayman's engine/content verification suite."""


def pytest_configure(config) -> None:
    config.addinivalue_line("markers", "network: tests requiring live internet access to NASA/DOI endpoints")
