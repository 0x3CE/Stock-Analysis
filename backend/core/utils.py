import numpy as np

def safe_float(value):
    try:
        if value is None or (isinstance(value, float) and np.isnan(value)):
            return 0.0
        return float(value)
    except Exception:
        return 0.0