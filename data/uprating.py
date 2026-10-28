"""Uprating to 2026-27, from the OBR's October 2026 forecast (detailed forecast tables, economy). One place, so the
seed, the calibration and the checks always use the same forecast.

Average weekly earnings index (table 1.6), financial years: 2023-24 148.372, 2024-25 156.244, 2025-26 161.849,
2026-27 167.602. (March 2026's were 148.360, 156.623, 163.804 and 169.000: earnings growth in 2025-26 came in lower.)
"""

AWE = {"2023-24": 148.372, "2024-25": 156.244, "2025-26": 161.849, "2026-27": 167.602}

EARNINGS_2023_24_TO_2026_27 = AWE["2026-27"] / AWE["2023-24"]
EARNINGS_2024_25_TO_2026_27 = AWE["2026-27"] / AWE["2024-25"]
EARNINGS_2025_26_TO_2026_27 = AWE["2026-27"] / AWE["2025-26"]  # ASHE 2026's annual pay is for the year to April 2026

# Eligible rent growth (table 1.18), 2025-26 and 2026-27: private non-LHA rents, and local authority rents for social.
RENT_GROWTH = {"Private rented": 1.04 * 1.04, "Social rented": 1.075 * 1.046}

# Employees (16+) and wages and salaries in 2026-27 (table 1.6).
EMPLOYEES_2026_27 = 29.944e6
WAGES_AND_SALARIES_2026_27 = 1292.869e9
