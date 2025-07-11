const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { DateTime } = require('luxon');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Port-specific time zone mapping
const portTimeZones = {
  'aalborg': 'Europe/Copenhagen',
  'agios nikolaus, crete': 'Europe/Athens',
  'akureyri': 'Atlantic/Reykjavik',
  'alesund': 'Europe/Oslo',
  'almeria': 'Europe/Madrid',
  'amsterdam': 'Europe/Amsterdam',
  'antigua': 'America/Antigua',
  'argostoli': 'Europe/Athens',
  'arrecife': 'Atlantic/Canary',
  'athens': 'Europe/Athens',
  'barcelona': 'Europe/Madrid',
  'bergen': 'Europe/Oslo',
  'bodo': 'Europe/Oslo',
  'bordeaux': 'Europe/Paris',
  'bridgetown': 'America/Barbados',
  'cadiz': 'Europe/Madrid',
  'cannes': 'Europe/Paris',
  'cartagena': 'Europe/Madrid',
  'casablanca': 'Africa/Casablanca',
  'catania': 'Europe/Rome',
  'civitavecchia': 'Europe/Rome',
  'colon': 'America/Panama',
  'colombo': 'Asia/Colombo',
  'corfu': 'Europe/Athens',
  'copenhagen': 'Europe/Copenhagen',
  'crete': 'Europe/Athens',
  'cuxhaven': 'Europe/Berlin',
  'dubrovnik': 'Europe/Zagreb',
  'dover': 'Europe/London',
  'el ferrol': 'Europe/Madrid',
  'funchal': 'Atlantic/Madeira',
  'gdansk': 'Europe/Warsaw',
  'gibraltar': 'Europe/Gibraltar',
  'gothenburg': 'Europe/Stockholm',
  'grenada': 'America/Grenada',
  'gudvangen': 'Europe/Oslo',
  'hamburg': 'Europe/Berlin',
  'harlingen': 'Europe/Amsterdam',
  'honfleur': 'Europe/Paris',
  'husavik': 'Atlantic/Reykjavik',
  'istanbul': 'Europe/Istanbul',
  'kalamata': 'Europe/Athens',
  'katakolon': 'Europe/Athens',
  'kotor': 'Europe/Podgorica',
  'kristiansand': 'Europe/Oslo',
  'kristiansund': 'Europe/Oslo',
  'kuşadasi': 'Europe/Istanbul',
  'las palmas': 'Atlantic/Canary',
  'la spezia': 'Europe/Rome',
  'le lavandou': 'Europe/Paris',
  'leixoes': 'Europe/Lisbon',
  'lisbon': 'Europe/Lisbon',
  'livorno': 'Europe/Rome',
  'longyearbyen': 'Arctic/Longyearbyen',
  'malaga': 'Europe/Madrid',
  'monte carlo': 'Europe/Monaco',
  'naples': 'Europe/Rome',
  'nice': 'Europe/Paris',
  'oslo': 'Europe/Oslo',
  'palermo': 'Europe/Rome',
  'palma de mallorca': 'Europe/Madrid',
  'panama city': 'America/Panama',
  'porto': 'Europe/Lisbon',
  'portsmouth': 'Europe/London',
  'reykjavik': 'Atlantic/Reykjavik',
  'rhodes': 'Europe/Athens',
  'rome': 'Europe/Rome',
  'santa cruz': 'Atlantic/Canary',
  'santorini': 'Europe/Athens',
  'seville': 'Europe/Madrid',
  'seyðisfjörður': 'Atlantic/Reykjavik',
  'sibenik': 'Europe/Zagreb',
  'sicily': 'Europe/Rome',
  'split': 'Europe/Zagreb',
  'stockholm': 'Europe/Stockholm',
  'tenerife': 'Atlantic/Canary',
  'valletta': 'Europe/Malta',
  'venice': 'Europe/Rome',
  'willemstad': 'America/Curacao',
  'zeebrugge': 'Europe/Brussels'
};

function normalizePortName(portName) {
  return portName.toLowerCase().split(/[-/,()]/)[0].trim();
}

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

    // Group entries by ship
    data.forEach((entry) => {
      const ship = entry.Ship;
      if (!grouped[ship]) grouped[ship] = [];
      grouped[ship].push(entry);
    });

    const statuses = Object.entries(grouped).map(([ship, rawStops]) => {
      rawStops.sort((a, b) => new Date(a.DATE) - new Date(b.DATE));

      const stops = rawStops.map((entry, idx, arr) => {
        const port = entry.PORT || '';
        const zone = portTimeZones[normalizePortName(port)] || 'UTC';

        let arrival = entry.ARRIVAL
          ? DateTime.fromISO(entry.ARRIVAL, { zone })
          : null;

        let departure = entry.DEPARTURE
          ? DateTime.fromISO(entry.DEPARTURE, { zone })
          : null;

        if (!arrival && idx > 0 && arr[idx - 1].DEPARTURE) {
          arrival = DateTime.fromISO(arr[idx - 1].DEPARTURE, { zone });
        }

        if (!departure && idx < arr.length - 1 && arr[idx + 1].ARRIVAL) {
          departure = DateTime.fromISO(arr[idx + 1].ARRIVAL, { zone });
        }

        if (!arrival) {
          arrival = DateTime.fromISO(entry.DATE, { zone });
        }
        if (!departure) {
          departure = arrival.plus({ hours: 12 });
        }

        return {
          ...entry,
          arrival: arrival.setZone('America/Denver'),
          departure: departure.setZone('America/Denver'),
        };
      });

      // Status calculation
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
  // Find latest stop where ship has arrived (even if not yet departed)
  const lastIndex = [...stops].reverse().findIndex(stop => stop.arrival <= now);
  const lastAbsoluteIndex = lastIndex !== -1 ? stops.length - 1 - lastIndex : -1;

  // Get last port and potential next one
  const lastStop = lastAbsoluteIndex !== -1 ? stops[lastAbsoluteIndex] : null;
  const nextStop = stops.find(stop => stop.arrival > now);

  if (lastStop && lastStop.departure > now) {
    // Ship has arrived but not departed: still at port
    currentStatus = 'At Port';
    currentPort = lastStop.PORT;
    previousPort = lastAbsoluteIndex > 0 ? stops[lastAbsoluteIndex - 1].PORT : '';
    nextPorts = stops.slice(lastAbsoluteIndex + 1, lastAbsoluteIndex + 4).map(s => s.PORT);
  } else if (lastStop && nextStop) {
    // Ship departed last stop, en route to next
    currentStatus = 'In Transit';
    previousPort = lastStop.PORT;
    currentPort = `${lastStop.PORT} ➜ ${nextStop.PORT}`;
    const nextIndex = stops.findIndex(stop => stop === nextStop);
    nextPorts = stops.slice(nextIndex, nextIndex + 3).map(s => s.PORT);
  } else {
    // Finished route
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
