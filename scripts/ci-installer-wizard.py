#!/usr/bin/env python3
"""Drive the real installer in a disposable Linux CI PTY, without exposing input."""
import fcntl
import os
from pathlib import Path
import pty
import secrets
import select
import signal
import struct
import subprocess
import termios
import time

assert os.environ.get('GITHUB_ACTIONS') == 'true'
assert os.environ.get('RUNNER_ENVIRONMENT') == 'github-hosted'
password = 'Ci!9' + secrets.token_hex(24)
root = Path.cwd()
answers = [
    ('请输入域名', 'weather.example.test'),
    ('自定义数据库和内部密钥', 'n'),
    ('请输入管理员邮箱', 'ci@example.test'),
    ('请输入管理员密码:', password),
    ('请再次输入管理员密码:', password),
    ('请输入管理员显示名称', 'CI'),
    ('证书导入方式', '2'),
    ('证书文件路径', str(root / '.runtime/ci-cert/origin.pem')),
    ('私钥文件路径', str(root / '.runtime/ci-cert/origin.key')),
    ('直接回车继续，输入 n 取消:', ''),
]
master, slave = pty.openpty()
attrs = termios.tcgetattr(slave)
attrs[3] &= ~termios.ECHO
termios.tcsetattr(slave, termios.TCSANOW, attrs)
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 32, 100, 0, 0))
process = subprocess.Popen(['bash', 'scripts/install.sh'], stdin=slave, stdout=slave,
                           stderr=slave, start_new_session=True,
                           env={**os.environ, 'TERM': 'xterm-256color'})
os.close(slave)
transcript = bytearray()
cursor = 0
next_answer = 0
deadline = time.monotonic() + 1800
last_progress = time.monotonic()
try:
    while True:
        if time.monotonic() > deadline:
            raise TimeoutError('Installer exceeded 30 minutes')
        if select.select([master], [], [], 1)[0]:
            try:
                chunk = os.read(master, 65536)
            except OSError:
                break
            if not chunk:
                break
            transcript.extend(chunk)
        if next_answer < len(answers):
            marker, answer = answers[next_answer]
            position = transcript.find(marker.encode(), cursor)
            if position >= 0:
                os.write(master, (answer + '\n').encode())
                cursor = position + len(marker.encode())
                next_answer += 1
                print(f'Installer wizard: completed input {next_answer}/{len(answers)}', flush=True)
        if time.monotonic() - last_progress > 30:
            print('Installer wizard: build / runtime checks still running.', flush=True)
            last_progress = time.monotonic()
        if process.poll() is not None:
            break
    status = process.wait(timeout=10)
    output = transcript.decode(errors='replace')
    # Never publish raw input, even if a terminal implementation unexpectedly echoes it.
    output = output.replace(password, '[REDACTED]')
    Path('.runtime/installer-transcript.txt').write_text(output)
    if status or next_answer != len(answers) or '部署完成。' not in output:
        print(output[-16000:])
        raise RuntimeError(f'Installer failed: exit={status}, inputs={next_answer}')
    print('Real interactive installer completed successfully, including HTTPS/API checks.')
finally:
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=10)
    os.close(master)
