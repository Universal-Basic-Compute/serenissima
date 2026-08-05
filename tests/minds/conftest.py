"""Local pytest config for minds tests: registers the integration marker."""


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: hits the real local Ollama server (skipped if unreachable)",
    )
