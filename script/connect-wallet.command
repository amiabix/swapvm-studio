#!/bin/zsh
cd "${0:A:h:h}" || exit 1
python3 script/connect-wallet.py
printf '\nPress Enter to close.\n'
read
