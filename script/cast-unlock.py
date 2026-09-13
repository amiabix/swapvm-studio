#!/usr/bin/env python3
"""Feed cast's hidden terminal prompt from stdin. Never put the password in argv/env/files."""
import errno, os, pty, re, select, signal, sys, termios, time
password = sys.stdin.buffer.read()
if b'\n' in password or b'\r' in password:
    raise SystemExit('Password must be one line')
pid, master = pty.fork()
if pid == 0:
    attrs = termios.tcgetattr(0)
    attrs[3] &= ~(termios.ECHO | termios.ECHONL)
    termios.tcsetattr(0, termios.TCSANOW, attrs)
    env = os.environ.copy()
    for key in ('CAST_PASSWORD', 'ETH_PASSWORD', 'ETH_PASSWORD_FILE'):
        env.pop(key, None)
    os.execve(sys.argv[1], [sys.argv[1], '--color', 'never', *sys.argv[2:]], env)
output = bytearray()
sent = False
deadline = time.monotonic() + 90
try:
    while True:
        if time.monotonic() > deadline:
            raise TimeoutError('cast timed out')
        if not select.select([master], [], [], 0.1)[0]:
            continue
        try:
            chunk = os.read(master, 65536)
        except OSError as error:
            if error.errno == errno.EIO:
                break
            raise
        if not chunk:
            break
        output.extend(chunk)
        if not sent and b'password' in output.lower():
            os.write(master, password + b'\n')
            sent = True
    _, status = os.waitpid(pid, 0)
except BaseException:
    os.kill(pid, signal.SIGKILL)
    os.waitpid(pid, 0)
    raise
finally:
    os.close(master)
raw = bytes(output)
code = os.waitstatus_to_exitcode(status)
if code:
    if password:
        raw = raw.replace(password, b'[redacted]')
    sys.stderr.write(raw.decode(errors='replace')[-2000:])
    raise SystemExit(code)
# Successful commands here return only an address, signature or transaction hash.
values = re.findall(rb'(?:^|[\r\n])(0x[0-9a-fA-F]+)(?=[\r\n]|$)', raw)
if not values:
    raise SystemExit('cast returned no expected hex result')
print(values[-1].decode())
