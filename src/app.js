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
    const grouped = {};

    // Group stops by ship
    data.forEach((entry) => {
      const ship = entry.Ship;
      if (!grouped[ship]) grouped[ship] = [];
      grouped[ship].push(entry);
    });

    const shipStatus = {};

    Object.entries(grouped).forEach(([ship, stops]) => {
      const zone = shipTimezones[ship] || "UTC";
      const now = DateTime.now().setZone(zone);

      // Use correct format here
stops.sort((a, b) => {
  const aDate = DateTime.fromFormat(a.Arrival, "yyyy-MM-dd HH:mm:ss", { zone });
  const bDate = DateTime.fromFormat(b.Arrival, "yyyy-MM-dd HH:mm:ss", { zone });

  if (!aDate.isValid && !bDate.isValid) return 0;
  if (!aDate.isValid) return 1;
  if (!bDate.isValid) return -1;

  return aDate - bDate;
});


      let currentStatus = 'Unknown';
      let previousStop = null;
      let nextStops = [];

      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const arrival = DateTime.fromFormat(stop.Arrival, "yyyy-MM-dd HH:mm:ss", { zone });
        const departure = DateTime.fromFormat(stop.Departure, "yyyy-MM-dd HH:mm:ss", { zone });

        if (!arrival.isValid || !departure.isValid) continue;

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

    const statuses = Object.entries(shipStatus).map(([ship, status]) => ({
      ship,
      currentStatus: status.currentStatus,
      currentPort: status.currentStatus.startsWith('At ') ? status.currentStatus.replace('At ', '') : null,
      previousPort: status.previousStop?.Port || null,
      nextPorts: status.nextStops.map(s => s.Port)
    }));

    // Use any ship's timezone (or UTC) for display timestamp
    res.render('index', {
      statuses,
      now: DateTime.now().setZone('Etc/UTC').toFormat('yyyy-LL-dd HH:mm ZZZZ')
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
