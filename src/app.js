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

    // Group stops by ship
    data.forEach((entry) => {
      const ship = entry.Ship;
      if (!grouped[ship]) grouped[ship] = [];
      grouped[ship].push(entry);
    });

    const statuses = Object.entries(grouped).map(([ship, rawStops]) => {
      // Sort by schedule date first
      rawStops.sort((a, b) => new Date(a.DATE) - new Date(b.DATE));

      // Fill in arrival/departure values with timezone from CSV
      const stops = rawStops.map((entry, idx, arr) => {
        let arrival = DateTime.fromISO(entry.ARRIVAL || '', { setZone: true });
        let departure = DateTime.fromISO(entry.DEPARTURE || '', { setZone: true });

        if (!arrival.isValid && idx > 0) {
          const prev = DateTime.fromISO(arr[idx - 1].DEPARTURE || '', { setZone: true });
          if (prev.isValid) arrival = prev;
        }

        if (!departure.isValid && idx < arr.length - 1) {
          const next = DateTime.fromISO(arr[idx + 1].ARRIVAL || '', { setZone: true });
          if (next.isValid) departure = next;
        }

        if (!arrival.isValid) arrival = DateTime.fromISO(entry.DATE || '', { setZone: true });
        if (!departure.isValid) departure = arrival.plus({ hours: 12 });

        const timeZone = entry.TIMEZONE || 'UTC';

        return {
          ...entry,
          arrival: arrival.setZone(timeZone),
          departure: departure.setZone(timeZone),
          timeZone
        };
      });

      // Determine current ship status
      let currentStatus = 'Unknown';
      let currentPort = '', previousPort = '', nextPorts = [];

      const atPortIndex = stops.findIndex(
        stop => stop.arrival <= now && now <= stop.departure
      );

      if (atPortIndex !== -1) {
        currentStatus = 'At Port';
        currentPort = stops[atPortIndex].PORT;
        previousPort = atPortIndex > 0 ? stops[atPortIndex - 1].PORT : '';
        nextPorts = stops.slice(atPortIndex + 1, atPortIndex + 4).map(s => s.PORT);
      } else {
        const nextIndex = stops.findIndex(stop => stop.arrival > now);
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

      // Determine local time from the first matching timezone in stops
      const localTimeZone = stops.find(s => s.timeZone)?.timeZone || 'UTC';
      const localTime = now.setZone(localTimeZone).toFormat("cccc, dd LLL yyyy, t ZZZZ");

      return {
        ship,
        currentStatus,
        currentPort,
        previousPort,
        nextPorts,
        localTime
      };
    });

    res.render('index', { statuses, now: now.toFormat("ffff") });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
