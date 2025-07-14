const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { DateTime } = require('luxon');

const portTimeZones = {
  // Iceland
  'akureyri': 'Atlantic/Reykjavik',
  'isafjordur': 'Atlantic/Reykjavik',
  'reykjavik': 'Atlantic/Reykjavik',
  'seyðisfjörður': 'Atlantic/Reykjavik',
  'seydisfjordur': 'Atlantic/Reykjavik',

  // Panama
  'balboa': 'America/Panama',
  'panama city': 'America/Panama',
  'colon': 'America/Panama',
  'colón': 'America/Panama',

  // Costa Rica
  'puerto caldera': 'America/Costa_Rica',
  'puntarenas': 'America/Costa_Rica',

  // Colombia
  'cartagena': 'America/Bogota',

  // Aruba
  'oranjestad': 'America/Aruba',

  // Curaçao
  'willemstad': 'America/Curacao',

  // Barbados
  'bridgetown': 'America/Barbados',

  // Saint Lucia
  'castries': 'America/St_Lucia',

  // Martinique
  'fort-de-france': 'America/Martinique',

  // Antigua
  'st johns': 'America/Antigua',

  // US Virgin Islands
  'charlotte amalie': 'America/St_Thomas',

  // Dominican Republic
  'la romana': 'America/Santo_Domingo',

  // Puerto Rico
  'san juan': 'America/Puerto_Rico',

  // Bahamas
  'nassau': 'America/Nassau',

  // Mexico
  'puerto vallarta': 'America/Mazatlan',
  'cabo san lucas': 'America/Mazatlan',

  // Greece (example)
  'piraeus': 'Europe/Athens',

  // Italy (example)
  'civitavecchia': 'Europe/Rome'
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

      // Fill in arrival/departure values
const stops = rawStops.map((entry, idx, arr) => {
  const port = entry.PORT || '';
  const cleanPort = port.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const portZone = portTimeZones[cleanPort] || 'UTC';

  let arrival = entry.ARRIVAL
    ? DateTime.fromISO(entry.ARRIVAL, { zone: portZone })
    : null;
  let departure = entry.DEPARTURE
    ? DateTime.fromISO(entry.DEPARTURE, { zone: portZone })
    : null;

  if (!arrival && idx > 0 && arr[idx - 1].DEPARTURE) {
    arrival = DateTime.fromISO(arr[idx - 1].DEPARTURE, { zone: portZone });
  }
  if (!departure && idx < arr.length - 1 && arr[idx + 1].ARRIVAL) {
    departure = DateTime.fromISO(arr[idx + 1].ARRIVAL, { zone: portZone });
  }

  if (!arrival) arrival = DateTime.fromISO(entry.DATE || '', { zone: portZone });
  if (!departure) departure = arrival.plus({ hours: 12 });

  return {
    ...entry,
    arrival: arrival.setZone('America/Denver'),
    departure: departure.setZone('America/Denver'),
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
  const lastIndex = nextIndex - 1;
  const lastStop = lastIndex >= 0 ? stops[lastIndex] : null;
  const nextStop = stops[nextIndex];

  currentStatus = 'In Transit';
  previousPort = lastStop?.PORT || 'At Sea';
  currentPort = previousPort === nextStop.PORT
  ? previousPort
  : `${previousPort} ➜ ${nextStop.PORT}`;

  nextPorts = stops.slice(nextIndex, nextIndex + 3).map(s => s.PORT);
}
 else {
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
