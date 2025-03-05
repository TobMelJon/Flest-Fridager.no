#Test build_master_calender output
"""
from backend.kalender import build_master_calender

cal = build_master_calender(
    year=2025,
    weekend_off=True,
    squeeze_day=True,
    pto_budget=5
)
print(f"Total days: {len(cal)}")
print("First 5 days:", cal[:5])
"""
