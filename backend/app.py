# app.py
from flask import Flask, render_template, request
from kalender import build_master_calender

app = Flask(__name__)

@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        # Get values from the submitted form. For example, checkboxes named 'weekend_off' and 'squeeze_day'
        weekend_off = request.form.get("weekend_off") == "yes" #if checked that means 'yes
        squeeze_day = request.form.get("squeeze_day") == "yes" #if checked that means 'yes
        # You could also get other parameters (e.g., pto_budget) from the form:
        pto_budget = int(request.form.get("pto_budget", 21))
        # Build the master calendar using the parameters
        master_calendar = build_master_calender(
            year=2025,
            weekend_off=weekend_off,
            squeeze_day=squeeze_day,
            pto_budget=pto_budget
        )
    else:
        # On a GET request, use default settings.
        master_calendar = build_master_calender(year=2025)

    # Optionally convert datetime objects to strings for easier display in HTML.
    formatted_calendar = [
        [day[0].isoformat(), day[1], day[2], day[3]] for day in master_calendar
    ]
    return render_template("index.html", calendar=formatted_calendar)

if __name__ == "__main__":
    app.run(debug=True)
