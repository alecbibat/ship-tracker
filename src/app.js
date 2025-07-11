const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { DateTime } = require('luxon');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));

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
  return portName
    .toLowerCase()
    .split(/[-/,(]/)[0]
    .trim();
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

    data.forEach((entry) => {
      const ship = entry.Ship;
      const rawPort = entry.PORT || '';
      const cleanPort = normalizePortName(rawPort);
      const portZone = portTimeZones[cleanPort] || 'UTC';

      let arrival = null, departure = null;

      try {
        if (entry.ARRIVAL) {
          arrival = DateTime.fromISO(entry.ARRIVAL, { zone: portZone }).setZone('America/Denver');
        }
      } catch {}

      try {
        if (entry.DEPARTURE) {
          departure = DateTime.fromISO(entry.DEPARTURE, { zone: portZone }).setZone('America/Denver');
        }
      } catch {}

      if (!grouped[ship]) grouped[ship] = [];
      grouped[ship].push({ ...entry, arrival, departure });
    });

    const statuses = Object.entries(grouped).map(([ship, stops]) => {
      // Sort only those with valid arrival
      stops.sort((a, b) => {
        if (!a.arrival) return 1;
        if (!b.arrival) return -1;
        return a.arrival - b.arrival;
      });

      let currentStatus = 'Unknown';
      let currentPort = '', previousPort = '', nextPorts = [];

      const now = DateTime.now().setZone('America/Denver');

      let atPortIndex = stops.findIndex(stop =>
        stop.arrival && stop.departure &&
        stop.arrival <= now && now <= stop.departure
      );

      if (atPortIndex !== -1) {
        currentStatus = 'At Port';
        currentPort = stops[atPortIndex].PORT;
        previousPort = atPortIndex > 0 ? stops[atPortIndex - 1].PORT : '';
        nextPorts = stops.slice(atPortIndex + 1, atPortIndex + 4).map(s => s.PORT);
      } else {
        let nextIndex = stops.findIndex(stop => stop.arrival && stop.arrival > now);
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
