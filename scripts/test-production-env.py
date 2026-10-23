"""Local, secret-free validation of the production environment guard."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("validator", Path(__file__).with_name("validate-production-env.py"))
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


class ProductionEnvironmentTests(unittest.TestCase):
    def parse(self, text):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "env"
            path.write_text(text, encoding="utf-8")
            return validator.read_env(path)

    def valid(self):
        text = (Path(__file__).parents[1] / "deploy/env.production.template").read_text(encoding="utf-8")
        for key, value in {
            "DOMAIN": "weather.example.test", "POSTGRES_DB": "weather", "POSTGRES_USER": "weather",
            "POSTGRES_PASSWORD": "database-password-123", "REDIS_PASSWORD": "redis-password-12345",
            "JWT_SECRET": "j" * 48, "ADMIN_EMAIL": "admin@example.test",
            "ADMIN_INITIAL_PASSWORD_B64": "", "ADMIN_DISPLAY_NAME": "Admin",
        }.items():
            text = text.replace(key + "_PLACEHOLDER", value)
        return self.parse(text)

    def test_template_with_real_values(self):
        validator.validate(self.valid())

    def test_unsafe_modes_and_addresses_fail(self):
        for field, value in {"ADMIN_AUTH_BYPASS": "true", "LOCAL_MAP_PREVIEW": "true",
                "WEATHER_PROVIDER_MODE": "mock", "API_TRUST_PROXY": "true",
                "API_TRUSTED_PROXIES": "0.0.0.0/0", "OPEN_METEO_API_KEY": "paid-key",
                "PUBLIC_SITE_URL": "http://weather.example.test", "NEXT_PUBLIC_API_BASE_URL": "http://api:4000",
                "DATABASE_URL": "postgresql://wrong:secret@postgres:5432/weather",
                "CADDY_INTERNAL_IP": "172.30.80.0", "JWT_SECRET": "short"}.items():
            with self.subTest(field=field), self.assertRaises(ValueError) as caught:
                validator.validate({**self.valid(), field: value})
            self.assertNotIn(value, str(caught.exception))

    def test_rejects_shell_code_without_execution(self):
        for raw in ['$(id)', '"$(id)"', '"`id`"', '"ok";id', '"\\\\$(id)"', '"ends\\"']:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                self.parse("VALUE=" + raw)

    def test_decodes_installer_quoted_values(self):
        self.assertEqual(self.parse('VALUE="text \\$ \\` \\\" \\\\"')['VALUE'], 'text $ ` " \\')

    def test_duplicate_variables_are_rejected(self):
        with self.assertRaises(ValueError):
            self.parse("KEY=one\nKEY=two")


if __name__ == "__main__":
    unittest.main()
