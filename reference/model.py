#!/usr/bin/env python3
"""Independent unbounded-integer model; produces ABI-encoded cases for Foundry.
No Solidity Math.mulDiv, EVM rounding, or contract implementation is reused.
"""
import random
from pathlib import Path
MAX = (1 << 256) - 1

def clamp(x, y, wallet, allowance, mode):
    deliverable = min(y, wallet, allowance)
    if y == 0 or deliverable == y or mode == 1:
        return x, deliverable
    quotient, remainder = divmod(x * deliverable, y)
    return quotient + bool(remainder), deliverable

def main():
    random_source = random.Random(20260913)
    boundaries = [0, 1, 2, 3, 10**18, (1 << 128)-1, MAX-1, MAX]
    cases = [(x,y,w,a) for x in boundaries for y in boundaries for w in boundaries for a in boundaries]
    for _ in range(1904):
        cases.append(tuple(random_source.getrandbits(random_source.choice([8,64,128,256])) for _ in range(4)))
    records = []
    for x,y,w,a in cases:
        ai,ao = clamp(x,y,w,a,0)
        bi,bo = clamp(x,y,w,a,1)
        assert bi == x and bo == ao and ai <= x
        records.append((x,y,w,a,ai,ao))
    # ABI dynamic array of fixed six-uint tuples: offset, length, records.
    words = [32,len(records)] + [word for record in records for word in record]
    output = Path(__file__).with_name('cases.abi')
    output.write_bytes(b''.join(word.to_bytes(32,'big') for word in words))
    print(f'{len(records)} states / {2*len(records)} mode comparisons; seed=20260913; {output}')

if __name__ == '__main__':
    main()
