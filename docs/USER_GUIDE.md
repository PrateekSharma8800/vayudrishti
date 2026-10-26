# VayuDrishti user guide

For students and field researchers. No coding needed.

## What this is for

VayuDrishti helps you answer a simple question: **where in my area is the air worst, and is traffic the reason?**

You do the measuring: count the vehicles passing a few spots and collect the dust that settles there. VayuDrishti turns those numbers into charts, ranks the spots from cleanest to most polluted, and shows whether more traffic goes with more dust. It can also show you the air quality and traffic **right now** for places across Delhi NCR.

There are two kinds of information, and it helps to keep them apart:

| | Observations | Live |
|---|---|---|
| Where it comes from | **You**, standing at a spot | Automatic, from IQAir and TomTom |
| What it shows | Vehicles per hour, share of heavy vehicles, dust | Air quality index (AQI), traffic speed, congestion |
| How fresh | The day you measured | Right now |
| Used for | Your study, hotspots and charts | Context, and a feel for how the air changes |

## Your first five minutes

1. Open the page and go to **Observations**.
2. Press **Load sample data**. Demo records appear, clearly marked "Sample".
3. Look at **Dashboard**, **Charts** and **Hotspots** to see what a finished study looks like.
4. Press **Remove sample data** when you are ready to start your own. Your own records are never touched.

## Running a field study

### 1. Choose your spots

Pick 3 to 6 places that are different from each other: a busy junction, a bus stand, a quiet residential street, a park gate. Use **exactly the same name** each time you visit a spot, because that is how VayuDrishti groups your readings.

### 2. Count the vehicles

Stand somewhere safe, away from the road edge. In **Observations**, open the **Field counter**:

1. Choose how long to count (10 minutes is a good default).
2. Tap **Cars, bikes, autos** for every light vehicle that passes, and **Trucks and buses** for every heavy one. The timer starts on your first tap.
3. Made a wrong tap? Press **Undo last tap**. Need a break? Press **Pause**.
4. When time is up (or you press **Finish now**) you see something like *"142 vehicles in 10:00 means about 852 vehicles per hour, and 11% were trucks or buses."*
5. Press **Use these numbers in the form**. The vehicles per hour and heavy-vehicle share are filled in for you.

A count shorter than 30 seconds is not scaled up to an hour, because the result would not be honest.

### 3. Collect the dust

Dust deposition is how much dust settles on a surface over a day.

1. Weigh a clean, flat plate or jar lid (in milligrams) and write the weight down.
2. Leave it in the open at the spot for 24 hours, where nobody will knock it over.
3. Weigh it again. The difference is the dust collected, in milligrams.
4. Measure the plate's area in cm².
5. In the form, open **Work it out from my plate**, enter the dust (mg), the area (cm²) and the days left out, and press **Use this value**.

Example: 2.5 mg of dust on a 200 cm² plate in one day is 125 mg/m²/day.

### 4. Save the observation

In the form add the **location** (same name every time), the **date**, the **time of day**, and the three numbers. Press **Save observation**. Add notes about the weather or anything unusual, such as construction nearby.

### 5. Repeat

One reading tells you little. Visit each spot on several days and at similar times of day. More spots and more days make the ranking more trustworthy.

## Reading the results

**Hotspot score.** Each spot gets a score from 0 to 100: 40% dust, 40% traffic and 20% heavy-vehicle share, each compared with a fixed reference. Below 40 is **Low**, 40 to 69 **Moderate**, 70 and above **High**. It is a teaching score, not an official index.

**The summary** names the top hotspot and the cleanest spot, and tells you whether traffic and dust rise together. A strong link is a clue, **not proof** that one causes the other: weather, wind and construction also move dust.

**Filters** at the top of the Dashboard let you look at one place or a date range. The table, charts and scores follow them.

**The table** can be sorted by clicking any column title (click again to reverse), and searched by place, date, slot or notes.

## Live conditions

1. Go to **Live** and pick a place from the **Place** list (Delhi, Noida and Greater Noida, Gurugram, Ghaziabad, Faridabad). Not in the list? Choose **Somewhere else** and type coordinates, or press **Use my location**.
2. Press **Fetch live data**.

You will see a ring with the US AQI, what that band means for people (general guidance from the US EPA, not medical advice), the main pollutant, temperature, and traffic speed and congestion. The colours behind the page change with the air: green for good through to plum for hazardous.

Two things to remember:
- The **AQI is for the nearest monitoring station**, so places in the same city often show the same number.
- The **traffic is for the road at the place you picked**, so it differs from place to place.

Every reading is saved in your browser, and once a place has two or more readings a chart shows how its AQI and congestion changed. Tick **Refresh every 15 minutes** to build that trend automatically (it pauses while the tab is hidden). **Clear saved readings** deletes them.

## The health survey

Ask people which symptoms they notice near busy roads (cough, eye irritation, breathlessness, headache, throat irritation) and whether they live or work within 100 m of a main road. Tick the answers and press **Submit response**. Nothing personal is stored, only running totals.

**Working as a group?** Totals live in each person's browser. Everyone presses **Export totals**, sends the file to one person, and that person presses **Add totals from a file** for each file. Do not add the same file twice: it counts twice, and you are asked before anything is added.

## Saving, moving and sharing your work

- **Everything is stored in your browser.** If you clear your browser's site data, or open the page in a different browser or on another device, it will look empty.
- **Back up often:** press **Export CSV** in Observations. To restore or move data, press **Import CSV**. Duplicates and demo rows are skipped, and invalid rows are counted and ignored.
- **Print report** (top right) opens the print dialog. Choose **Save as PDF** to get a file for your teacher. The report is dated, shows the summary, charts, tables and survey results, and always prints on white paper even if you use dark mode.

## Troubleshooting

**"Could not reach the server" in Live.** Live needs the server. Open the page through the address you were given (or run `npm start` and open http://localhost:8000). Opening the HTML file directly works for everything except Live.

**"... is missing on the server".** The person who set up the site has not added the API keys yet. See [DEPLOY.md](DEPLOY.md).

**"Too many requests" or "the daily limit ... is used up".** The site protects its free data quota. Wait a minute, or try again tomorrow. Readings are reused for 10 minutes, so pressing Fetch again straight away changes nothing.

**My data disappeared.** It is stored per browser. Check you are in the same browser and have not cleared site data. Restore from a CSV export.

**Charts are empty or the page is plain.** Charts and fonts load from the internet when the page opens. Reconnect and refresh. Tables and forms still work offline.

**A file will not import.** The CSV must have the columns Date, Location, Time slot, Vehicles per hour, Heavy vehicles %, Dust mg/m2/day (Notes and Sample data are optional). The easiest way to get the right format is to export first. Survey files must be ones exported from VayuDrishti.

## Keyboard and accessibility

Everything can be used with the keyboard. **Tab** moves between controls, **Enter** or **Space** presses a button, and **Esc** closes the menu on small screens. Charts have text descriptions for screen readers. If your device is set to reduce motion or transparency, the page stops animating and turns its glass surfaces solid.

## Words used here

- **AQI (Air Quality Index):** a 0 to 500 scale. The US scale is used here: 0 to 50 good, 51 to 100 moderate, 101 to 150 unhealthy for sensitive groups, 151 to 200 unhealthy, 201 to 300 very unhealthy, above 300 hazardous.
- **PM2.5:** tiny particles, smaller than 2.5 micrometres, that can reach deep into the lungs. Often the main pollutant in Delhi NCR.
- **Dust deposition:** dust that settles on a surface, in mg per square metre per day. It is not the same as PM2.5 in the air.
- **Vehicles per hour:** how many vehicles pass a point in an hour.
- **Heavy vehicles:** trucks and buses, as a share of all vehicles.
- **Hotspot:** a spot that scores high for dust, traffic or both.
