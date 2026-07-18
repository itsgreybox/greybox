from billing_engine import batch, legacy_hook

def run_nightly(records):
    results = []
    for r in records:
        if r.get('special'):
            results.append(legacy_hook(r))
        else:
            results.append(batch([r])[0])
    return results
