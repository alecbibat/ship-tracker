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

      let arrival = DateTime.fromISO(entry.ARRIVAL || '', { setZone: true });
      let departure = DateTime.fromISO(entry.DEPARTURE || '', { setZone: true });

      if (!arrival.isValid || !departure.isValid) return;

      arrival = arrival.setZone('America/Denver');
      departure = departure.setZone('America/Denver');

      if (!grouped[ship]) grouped[ship] = [];
      grouped[ship].push({ ...entry, arrival, departure });
    });

    const statuses = Object.entries(grouped).map(([ship, stops]) => {
      stops.sort((a, b) => a.arrival - b.arrival);

      let currentStatus = 'Unknown';
      let currentPort = '', previousPort = '', nextPorts = [];

      let atPortIndex = stops.findIndex(
        stop => stop.arrival <= now && now <= stop.departure
      );

      if (atPortIndex !== -1) {
        currentStatus = 'At Port';
        currentPort = stops[atPortIndex].PORT;
        previousPort = atPortIndex > 0 ? stops[atPortIndex - 1].PORT : '';
        nextPorts = stops.slice(atPortIndex + 1, atPortIndex + 4).map(s => s.PORT);
      } else {
        let nextIndex = stops.findIndex(stop => stop.arrival > now);
        if (nextIndex !== -1) {
          currentStatus = 'In Transit';
          previousPort = nextIndex > 0 ? stops[nextIndex - 1].PORT : '';
          currentPort = `${previousPort} ➜ ${stops[nextIndex].PORT}`;
          nextPorts = stops.slice(nextIndex, nextIndex + 3).map(s => s.PORT);
        } else {
          currentStatus = 'Completed';
          previousPort = stops[stops.length - 1]?.PORT || '';
        }
      }

      return { ship, currentStatus, currentPort, previousPort, nextPorts };
    });

    res.render('index', { statuses, now: now.toFormat("ffff") });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
