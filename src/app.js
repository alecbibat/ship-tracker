const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { DateTime } = require('luxon');

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
    const now = DateTime.now().setZone('America/Denver');
    const grouped = {};

    data.forEach((entry) => {
      const ship = entry.Ship;
      const arrival = DateTime.fromISO(entry.ARRIVAL, { zone: 'UTC' });
      const departure = DateTime.fromISO(entry.DEPARTURE, { zone: 'UTC' });

      if (!grouped[ship]) grouped[ship] = [];
      grouped[ship].push({ ...entry, arrival, departure });
    });

    const statuses = Object.entries(grouped).map(([ship, stops]) => {
      stops.sort((a, b) => new Date(a.arrival) - new Date(b.arrival));
      let currentStatus = 'Unknown';
      let currentPort = '', previousPort = '', nextPorts = [];
      let localTime = '', lastStopIndex = -1;

      stops.forEach((stop, i) => {
        if (stop.arrival <= now && now <= stop.departure) {
          currentStatus = 'At Port';
          currentPort = stop.PORT;
          lastStopIndex = i;
        } else if (now < stop.arrival && lastStopIndex === -1) {
          currentStatus = 'In Transit';
          currentPort = i > 0 ? `${stops[i - 1].PORT} ➜ ${stop.PORT}` : `En Route to ${stop.PORT}`;
          lastStopIndex = i - 1;
        }
      });

      if (lastStopIndex >= 0) previousPort = stops[lastStopIndex].PORT;
      nextPorts = stops.slice(lastStopIndex + 1, lastStopIndex + 4).map(s => s.PORT);

      // Determine local time using the timezone field from the appropriate stop
      let zone = 'UTC';
      if (currentStatus === 'At Port') {
        zone = stops[lastStopIndex]?.timezone || 'UTC';
      } else if (currentStatus === 'In Transit') {
        zone = stops[lastStopIndex + 1]?.timezone || 'UTC';
      } else {
        zone = stops[stops.length - 1]?.timezone || 'UTC';
      }

      localTime = DateTime.now().setZone(zone).toFormat("cccc, dd LLL yyyy, t ZZZZ");

      return { ship, currentStatus, currentPort, previousPort, nextPorts, localTime };
    });

    res.render('index', { statuses, now: now.toFormat("ffff") });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
