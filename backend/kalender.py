# kalender.py
import datetime
import holidays

def build_master_calender(
    year=2025,
    weekend_off=True,
    weekend_priority=False,
    squeeze_day=False,
    pto_budget=25
):
    """
    Builds the master calendar for the given year.
    Each element is [date_obj, is_off(bool), weight(int), weekday_name(str)].
    """

    master_calender = []

    # Build the basic calendar
    start_date = datetime.date(year, 1, 1)
    end_date = datetime.date(year, 12, 31)
    one_day = datetime.timedelta(days=1)
    current_date = start_date

    while current_date <= end_date:
        #create a list for each day, then append
        day_list = [] #Create day list
        day_list.append(current_date) #append current date
        day_list.append(bool(False)) #append bool for weekend off
        day_list.append(int(0)) #append int for weight, 0 standard
        day_list.append(current_date.strftime("%A")) #append date of current date
        master_calender.append(day_list) #append finished setup day list to master calender
        current_date += one_day #iterate 1 day
    #[date, bool, weight, weekday_name] <-- example for

    #Mark public holidays as off
    norway_holidays = holidays.country_holidays('NO', years=[year])
    for day in master_calender:
        if day[0] in norway_holidays:
            day[1] = True  # Mark as off

    # If weekend_off, mark Saturday/Sunday as off
    if weekend_off:
        for day in master_calender:
            if day[3] == "Saturday" or day[3] == "Sunday":
                day[1] = True
    elif weekend_priority:
        # If not weekend_off but we want to prioritize weekends with higher weight
        for day in master_calender:
            if day[3] == "Saturday" or day[3] == "Sunday":
                day[2] = 2

    # If we want to mark "squeezed" days off (between two off-days)
    if squeeze_day:
        used_pto = 0
        for i in range(1, len(master_calender) - 1):
            # Only consider this day if it's not already off
            if not master_calender[i][1]:
                # Check if both neighbors are off
                if master_calender[i - 1][1] and master_calender[i + 1][1]:
                    if used_pto < pto_budget:
                        master_calender[i][1] = True  # Mark day as off
                        master_calender[i][2] = 2     # Give it some weight
                        used_pto += 1

    # IMPORTANT: Always return the calendar, even if squeeze_day is False
    return master_calender
