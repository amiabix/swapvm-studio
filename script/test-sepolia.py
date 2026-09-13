#!/usr/bin/env python3
"""Unlock once locally; no password in argv, environment variables, files, or logs."""
import getpass, pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parents[1]
subprocess.run([str(pathlib.Path.home()/'.foundry/bin/forge'), 'build'], cwd=root, check=True)
subprocess.run(['node', 'app/atomic.mjs', 'verify-sample'], cwd=root, check=True)
print('Sepolia atomic demo — cure-issuer. Test ETH budget: 0.04 ETH; gas cap: 3 gwei.', flush=True)
print('Deploys demo assets and tests rollback, settlement, and ENS revocation; restores the release afterwards.', flush=True)
password = getpass.getpass('Unlock cure-issuer (password stays in this terminal): ')
result = subprocess.run(['node', '--env-file='+str(root.parent/'cure/.env'), 'app/sepolia-test.mjs'], cwd=root, input=password.encode())
del password
sys.exit(result.returncode)
