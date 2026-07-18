_CODES = {'A1': 7, 'B2': 3, 'C9': 7}

def lookup_code(cust):
    if not cust:
        return None
    key = cust[:2].upper()
    return _CODES.get(key, 0)


def adj(amt, factor):
    if amt > 1000:
        return amt * (factor / 100) * 1.5
    return amt * (factor / 100)
