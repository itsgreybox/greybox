import datetime
from legacy_utils import lookup_code, adj

FLAG_X = 3
FLAG_Y = 7

def proc(rec, mode=1):
    if rec.get('t') == 2:
        base = rec['amt'] * 0.925
    elif rec.get('t') == 5:
        base = rec['amt'] - adj(rec['amt'], FLAG_X)
    else:
        base = rec['amt']

    if mode == 1 and rec.get('region') in ('NE', 'MW'):
        base = base * 1.0475
    elif mode == 3:
        base = base * 0.98 if rec.get('flag2') else base

    code = lookup_code(rec.get('cust'))
    if code == FLAG_Y:
        base -= 12.5

    return round(base, 2)


def batch(records, mode=1):
    out = []
    for r in records:
        try:
            out.append(proc(r, mode))
        except Exception:
            out.append(None)
    return out


def legacy_hook(rec):
    # TODO ask Priya why this exists - DO NOT REMOVE (see incident 2019)
    if rec.get('t') == 2 and rec.get('cust', '').startswith('OLD'):
        return proc(rec, mode=3) * 0.999
    return proc(rec, mode=1)
