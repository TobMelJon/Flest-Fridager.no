import datetime
import holidays


positive_answers = ["ja"]
negative_answers = ["nei"]
master_calender = []
#Example: [[datetime.date(2025, 1, 1), False, 0, 'Wednesday'],[...]]
#index:           1                     2     3      4

#Gets all the days in the x year
year = 2025
start_date = datetime.date(year, 1, 1)
end_date = datetime.date(year, 12, 31)
one_day = datetime.timedelta(days=1) #1-day time delta (iterates 1 day at a time)
pto_budget = 25 + 1
print(pto_budget)

def build_master_calender(year=2025, weekend_off = True, weekend_priority = False, squeeze_day = False, pto_budget = 21):
    """
    Builds the master calender for the given year and gets the input from user
    :param year: Year of desired calender
    :param weekend_off: Does one have weekend off?
    :param weekend_priority: If one wants weekend prioritised
    :param squeeze_day: Marks "Squeezed" days as higher prioritised
    :param pto_budget: Days to take off
    :return: list of each day in year, with pre-marked days off, and weight given to days desired off.
    """
    master_calender = []
    start_date = datetime.date(year, 1, 1)
    end_date = datetime.date(year, 12, 31)
    one_day = datetime.timedelta(days=1)

    #building calender template
    current_date = start_date
    while current_date <= end_date:
        day_list[
            current_date,
            False,
            0,
            current_date.strftime("%A"),
        ]
        master_calender.append(day_list)
        current_date += one_day

    #Mark public holidays
    Norway_holidays = holidays.country_holidays('NO', year = [year])
    for day in master_calender:
        if day[0] in Norway_holidays:
            day[1] = True

    #Is weekend off?
    if weekend_off:
        for day in master_calender:
            if day[3] == "Saturday" or day[3] == "Sunday":
                day[1] = True

    #if one wants weekend of
    elif weekend_priority:
        for day in master_calender:
            if day[3] == "Saturday" or day[3] == "Sunday":
                day[2] = 2

    if squeeze_day:
        used_pto = 0
        for i in range(1, len(master_calender) -1):
            if not master_calender[i][1]: #only consider days not already off
                if master_calender[i - 1][1] and master_calender[i + 1][1]: #check if both the previous and next days is off
                    if used_pto < pto_budget:
                        master_calender[i][1] = True
                        master_calender[i + 1][2] = 2
                        used_pto += 1

        return master_calender


#Gammel kode, kalender template 0.1
"""
#Go through each date, create list, append date into list, then append list with date intro master calender
#Also create the structure for the values of each day, date - bool for "if" holiday - int for weight (0-3)
while start_date <= end_date:
    day_list = []
    day_list.append(start_date)
    day_list.append(bool(False))
    day_list.append(int(0))
    day_list.append(start_date.strftime("%A"))
    master_calender.append(day_list)
    start_date += one_day
#print("Kalender mal", master_calender)


#gets all public holidays in Norway for given year, checks each date against public holiday. If date is public holiday, change bool to true.
Norway_holidays = holidays.country_holidays('NO', years=[year])
for day in master_calender:
    if day[0] in Norway_holidays :
        day[1] = True
#print("Kalender etter helligdager:", master_calender)


#while loop to force input to be either yes / no to store as bool for question
#input if one has saturday and sunday (weekend) off.
while 1:
    weekend_off = input("Har du fri i helgen? (Lørdag og Søndag)\n").strip().lower() #.strip().lower() makes all answers small letter and removes any " " (whitespaces)

    if weekend_off in positive_answers:
        weekend_off = True
        for day in master_calender: #loop through each day list
            if day[3] == "Saturday" or day[3] == "Sunday": #If the day is Saturday or Sunday
                day[1] = True #Then change bool (free) to True
        break
    elif weekend_off in negative_answers:
        weekend_off = False
        x = input("Ønsker du fri i helgene? (Lørdag og Søndag)\n").strip().lower()
        if x in positive_answers: #If yes to wanting free on Saturday and Sunday
            for day in master_calender: #Loop through master calender
                if day[3] == "Saturday" or day[3] == "Sunday": #Check if day is Saturday or Sunday
                    day[2] = 2 #change weight to 2
        elif x in negative_answers:
            pass
        break
    else:
        print("Vennligst svar Ja eller Nei")

#print("Kalender etter fri i helg:", master_calender)


#Må finne en god måte å hente inn endrende datoer for påske,vinter,høst. Legge til uke nr?
#input for if one wants to use PTO on squeeze days (work day inbetween 2 holidays)
while 1:
    school_breaks = input("Ønsker du å prioritere ferier? (Vinterferie, Påskeferie, Høstferie...\n").strip().lower()
    if school_breaks in positive_answers:
        school_breaks = True
        break
    elif school_breaks in negative_answers:
        school_breaks = False
        break
    else:
        print("Vennligst svar Ja eller Nei")


#input if one wants to use PTO on squeezed days
while 1:
    squeeze_day_1_day = input("Ønsker du å ta fri på inneklemte dager? (Kun 1 dag)\n").strip().lower()
    if squeeze_day_1_day in positive_answers:
        squeeze_day_1_day = True
        used_pto = 0
        for i in range(1, len(master_calender) - 1):
                if master_calender[i - 1][1] and master_calender[i + 1][1]: # Check if both the previous and next days are off
                    if used_pto < pto_budget: # Only mark this day as off if we haven't exceeded our PTO budget
                        master_calender[i][1] = True  #Mark the day as off
                        master_calender[i][2] = 2  #Also set its weight to 2
                        used_pto += 1 #Logg used days
        break
    elif squeeze_day_1_day in negative_answers:
        squeeze_day_1_day = False
        break
    else:
        print("Vennligst svar Ja/Nei")
#print("Kalender etter inneklemte dager:", master_calender)
"""