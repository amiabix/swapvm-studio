#!/usr/bin/env python3
"""Unlock the existing Foundry keystore for the local Studio signer; never expose a key to the browser."""
import getpass, pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parents[1]
print('Connect cure-issuer to Studio on Sepolia. This does not use or reset MetaMask.', flush=True)
print('Every signature and transaction requires YES in this Terminal. Session gas budget: 0.04 test ETH.', flush=True)
password = getpass.getpass('Foundry keystore password (press Enter if you originally left it blank): ')
result = subprocess.run(['node', '--env-file-if-exists=.env', 'app/foundry-server.mjs'], cwd=root, input=password.encode())
del password
sys.exit(result.returncode)
