import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from greybox.explainer import redact_secrets


def test_redacts_openai_style_api_key():
    source = 'API_KEY = "sk-abcdefghijklmnopqrstuvwxyz123456"'
    result = redact_secrets(source)
    assert "sk-abcdefghijklmnopqrstuvwxyz123456" not in result
    assert "REDACTED" in result


def test_redacts_aws_access_key():
    source = 'aws_key = "AKIAABCDEFGHIJKLMNOP"'
    result = redact_secrets(source)
    assert "AKIAABCDEFGHIJKLMNOP" not in result


def test_redacts_hardcoded_password_assignment():
    source = 'password = "SuperSecret123"'
    result = redact_secrets(source)
    assert "SuperSecret123" not in result
    assert "REDACTED" in result


def test_redacts_db_connection_string():
    source = 'DB_URL = "postgres://user:pass@localhost:5432/proddb"'
    result = redact_secrets(source)
    assert "user:pass@localhost" not in result


def test_leaves_normal_code_untouched():
    source = 'def add(a, b):\n    return a + b'
    result = redact_secrets(source)
    assert result == source
