"""Functional installer guard tests in temporary directories; never starts Docker."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
from types import SimpleNamespace
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASH = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else 'bash'


class InstallerRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'scripts/lib', self.root / 'scripts/lib')
        shutil.copy(ROOT / 'scripts/check-cloudflare.sh', self.root / 'scripts/check-cloudflare.sh')
        (self.root / 'deploy').mkdir()
        for file in ['Caddyfile', 'cloudflare.caddy']:
            (self.root / 'deploy' / file).write_text('# fixture\n')
        self.prefix = '''set -euo pipefail
export DOMAIN=weather.example.test
PROJECT_ROOT="$PWD"; SCRIPT_DIR="$PWD/scripts"
. scripts/lib/installer-ui.sh
. scripts/lib/installer-input.sh
. scripts/lib/installer-certificate.sh
. scripts/lib/deployment-runtime.sh
prompt_required() { ui_input "$1"; }
sleep() { :; }
'''

        if os.name == 'nt':
            self.prefix += f'''python3() {{ "{Path(sys.executable).as_posix()}" -X utf8 "$@"; }}\n'''

    def tearDown(self):
        self.temp.cleanup()

    def run_shell(self, source, input=''):
        # File transport avoids shell escaping and Windows argument conversion.
        (self.root / 'test.sh').write_text(self.prefix + source, encoding='utf-8', newline='\n')
        result = subprocess.run([BASH, 'test.sh'], cwd=self.root, input=input.encode(),
                                env={**os.environ, 'MSYS2_ARG_CONV_EXCL': '/CN='}, capture_output=True, timeout=25)
        return SimpleNamespace(returncode=result.returncode, stdout=result.stdout.decode('utf-8', errors='replace'),
                               stderr=result.stderr.decode('utf-8', errors='replace'))

    def certificate(self, domain='weather.example.test', days=30):
        result = self.run_shell(f'''mkdir -p source
openssl req -x509 -newkey rsa:2048 -nodes -days {days} -subj /CN={domain} -addext subjectAltName=DNS:{domain} -keyout source/origin.key -out source/origin.pem 2>/dev/null
''')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_success_requires_home_and_valid_api_json(self):
        for payload in ['{"status":"down"}', '<html>login</html>', '{}', 'null']:
            result = self.run_shell("curl() { printf '%s' '" + payload + "'; }; verify_public_https")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('未完成上线', result.stderr)
        good = self.run_shell('curl() { printf \'%s\' \'{"status":"ok"}\'; }; verify_public_https')
        self.assertEqual(good.returncode, 0, good.stderr)
        bad_home = self.run_shell('curl() { [[ "${!#}" == */health ]] || return 22; printf \'%s\' \'{"status":"ok"}\'; }; verify_public_https')
        self.assertNotEqual(bad_home.returncode, 0)

    def test_eof_stops_password_and_certificate_prompts(self):
        for command in ['prompt_password_twice', 'ui_input domain', 'import_origin_certificate']:
            with self.subTest(command=command):
                result = self.run_shell(command)
                self.assertNotEqual(result.returncode, 0)

    def test_certificate_file_import(self):
        self.certificate()
        result = self.run_shell('import_origin_certificate', '2\nsource/origin.pem\nsource/origin.key\n')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / 'source/origin.key').read_bytes(), (self.root / 'deploy/certs/origin.key').read_bytes())
        self.assertNotIn('BEGIN PRIVATE KEY', result.stdout + result.stderr)
        self.assertFalse(list((self.root / 'deploy').glob('.certificate.*')))

    def test_certificate_paste_is_hidden_and_complete(self):
        self.certificate()
        pem = (self.root / 'source/origin.pem').read_text()
        key = (self.root / 'source/origin.key').read_text()
        result = self.run_shell('import_origin_certificate', '1\n' + pem + key)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(key.splitlines()[1], result.stdout + result.stderr)

    def test_invalid_or_expiring_certificates_preserve_previous_files(self):
        (self.root / 'deploy/certs').mkdir()
        (self.root / 'deploy/certs/origin.key').write_text('existing-key')
        (self.root / 'deploy/certs/origin.pem').write_text('existing-cert')
        for domain, days in [('wrong.example.test', 30), ('weather.example.test', 1)]:
            self.certificate(domain, days)
            result = self.run_shell('import_origin_certificate', '2\nsource/origin.pem\nsource/origin.key\n')
            self.assertNotEqual(result.returncode, 0, domain)
            self.assertEqual((self.root / 'deploy/certs/origin.key').read_text(), 'existing-key')
            self.assertEqual((self.root / 'deploy/certs/origin.pem').read_text(), 'existing-cert')
        result = self.run_shell('import_origin_certificate', '1\n-----BEGIN CERTIFICATE-----\nincomplete\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / 'deploy/certs/origin.key').read_text(), 'existing-key')

    def test_mismatched_key_is_rejected(self):
        self.certificate()
        result = self.run_shell('openssl genrsa -out source/wrong.key 2048 2>/dev/null\nimport_origin_certificate', '2\nsource/origin.pem\nsource/wrong.key\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'deploy/certs').exists())

    def test_ui_keeps_decoration_out_of_captured_answers(self):
        result = self.run_shell('value="$(ui_input 域名 default.example)"; printf "%s" "$value"', '\n')
        self.assertEqual(result.stdout, 'default.example')
        self.assertIn('域名', result.stderr)


if __name__ == '__main__':
    unittest.main()
