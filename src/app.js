const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { DateTime } = require('luxon');

// ⏰ Timezones per ship
const shipTimezones = {
  'WIND SPIRIT': 'Europe/Berlin',
  'WIND STAR': 'Europe/Kiev',
  'WIND SURF': 'Europe/Berlin',
  'STAR PRIDE': 'Etc/UTC',
  'STAR BREEZE': 'Pacific/Tahiti',
  'STAR LEGEND': 'Etc/UTC'
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

    data.forEach((entry) => {
      const ship = entry.Ship.trim().toUpperCase();
      if (!grouped[ship]) grouped[ship] = [];
      grouped[ship].push(entry);
    });

    const statuses = Object.entries(grouped).map(([ship, rawStops]) => {
      const zone = shipTimezones[ship] || 'UTC';
      const now = DateTime.now().setZone(zone);

      rawStops.sort((a, b) => new Date(a.DATE) - new Date(b.DATE));

      const stops = rawStops.map((entry, idx, arr) => {
        let arrival = DateTime.fromISO((entry.ARRIVAL || '').trim(), { zone });
        let departure = DateTime.fromISO((entry.DEPARTURE || '').trim(), { zone });

        if (!arrival.isValid && idx > 0) {
          const prev = DateTime.fromISO((arr[idx - 1].DEPARTURE || '').trim(), { zone });
          if (prev.isValid) arrival = prev;
        }

        if (!departure.isValid && idx < arr.length - 1) {
          const next = DateTime.fromISO((arr[idx + 1].ARRIVAL || '').trim(), { zone });
          if (next.isValid) departure = next;
        }

        if (!arrival.isValid) arrival = DateTime.fromISO((entry.DATE || '').trim(), { zone });
        if (!departure.isValid) departure = arrival.plus({ hours: 12 });

        return {
          ...entry,
          arrival,
          departure
        };
      });

      let currentStatus = 'Unknown';
      let currentPort = '', previousPort = '', nextPorts = [];

      const atPortIndex = stops.findIndex(
        stop => stop.arrival <= now && now <= stop.departure
      );

      if (atPortIndex !== -1) {
        const departure = stops[atPortIndex].departure;
        const diff = departure.diff(now, ['hours', 'minutes']).toObject();
        const eta = `${Math.floor(diff.hours)}h ${Math.round(diff.minutes)}m`;
        currentStatus = `At Port (Departs in ${eta})`;
        currentPort = stops[atPortIndex].PORT;
        previousPort = atPortIndex > 0 ? stops[atPortIndex - 1].PORT : '';
        nextPorts = stops.slice(atPortIndex + 1, atPortIndex + 4).map(s => s.PORT);
      } else {
        const nextIndex = stops.findIndex(stop => stop.arrival > now);
        if (nextIndex !== -1) {
          const arrival = stops[nextIndex].arrival;
          const diff = arrival.diff(now, ['hours', 'minutes']).toObject();
          const eta = `${Math.floor(diff.hours)}h ${Math.round(diff.minutes)}m`;
          previousPort = nextIndex > 0 ? stops[nextIndex - 1].PORT : '';
const nextPort = stops[nextIndex].PORT;

if (previousPort === nextPort) {
  currentStatus = 'At Port (Holding)';
  currentPort = previousPort;
} else {
  currentStatus = `In Transit (ETA: ${eta})`;
  currentPort = `${previousPort} ➜ ${nextPort}`;
}

          nextPorts = stops.slice(nextIndex, nextIndex + 3).map(s => s.PORT);
        } else {
          currentStatus = 'Completed';
          previousPort = stops[stops.length - 1]?.PORT || '';
        }
      }

      return { ship, currentStatus, currentPort, previousPort, nextPorts };
    });

    res.render('index', {
      statuses,
      now: DateTime.now().toFormat("ffff")
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
