const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { DateTime } = require('luxon');

const shipTimezones = {
  'Wind Surf': 'Europe/Berlin',
  'Wind Star': 'Europe/Kiev',
  'Wind Spirit': 'Europe/Berlin',
  'Star Pride': 'Etc/UTC',
  'Star Breeze': 'Pacific/Tahiti',
  'Star Legend': 'Etc/UTC'
};

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));

function parseCSV(callback) {
  const results = [];
  fs.createReadStream(path.join(__dirname, '..', 'data', 'schedules.csv'))
    .pipe(csv())
    .on('data', (row) => results.push(row))
    .on('end', () => callback(results));
}

app.get('/', (req, res) => {
  parseCSV((data) => {
    const now = DateTime.now();

    const grouped = {};

    // Group stops by ship
    data.forEach((entry) => {
      const ship = entry.Ship;
      if (!grouped[ship]) grouped[ship] = [];
      grouped[ship].push(entry);
    });

    const shipStatus = {};

    Object.entries(grouped).forEach(([ship, stops]) => {
      stops.sort((a, b) =>
        DateTime.fromISO(a.Arrival, { zone: shipTimezones[ship] || "UTC" }) -
        DateTime.fromISO(b.Arrival, { zone: shipTimezones[ship] || "UTC" })
      );

      let currentStatus = 'Unknown';
      let previousStop = null;
      let nextStops = [];

      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const arrival = DateTime.fromISO(stop.Arrival, { zone: shipTimezones[ship] || "UTC" });
        const departure = DateTime.fromISO(stop.Departure, { zone: shipTimezones[ship] || "UTC" });

        if (now < arrival) {
          currentStatus = `In transit from ${previousStop ? previousStop.Port : 'Unknown'} to ${stop.Port}`;
          nextStops = stops.slice(i, i + 3);
          break;
        } else if (now >= arrival && now <= departure) {
          currentStatus = `At ${stop.Port}`;
          nextStops = stops.slice(i + 1, i + 4);
          break;
        }

        previousStop = stop;
      }

      if (currentStatus === 'Unknown') {
        currentStatus = 'Schedule complete or unknown';
      }

      shipStatus[ship] = {
        currentStatus,
        previousStop,
        nextStops
      };
    });

    res.render('index', { shipStatus });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
