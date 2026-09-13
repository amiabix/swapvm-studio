#!/bin/zsh
cd "${0:A:h:h}"
python3 script/test-sepolia.py
result=$?
printf '\nRunner exited with status %s. Evidence: artifacts/atomic-sepolia-test.json\n' "$result"
read -r '?Press Enter to close.'
