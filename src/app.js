const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const { DateTime } = require('luxon');
const fetch = require('node-fetch');
const tzlookup = require('tz-lookup');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));

const cacheFile = path.join(__dirname, '..', 'data', 'port_timezone_cache.json');
let portCache = {};

if (fs.existsSync(cacheFile)) {
  portCache = JSON.parse(fs.readFileSync(cacheFile));
}

async function getCoordinates(port, country) {
  const query = `${port}, ${country}`;
  if (portCache[query] && portCache[query].lat && portCache[query].lon) {
    return portCache[query];
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'ship-tracker' } });
  const data = await response.json();

  if (data.length === 0) return null;

  const { lat, lon } = data[0];
  portCache[query] = { lat: parseFloat(lat), lon: parseFloat(lon) };
  fs.writeFileSync(cacheFile, JSON.stringify(portCache, null, 2));
  return portCache[query];
}

function getTimezoneFromCoords(lat, lon) {
  try {
    return tzlookup(lat, lon);
  } catch {
    return 'UTC';
  }
}

function parseCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(path.join(__dirname, '..', 'data', 'schedules.csv'))
      .pipe(csv())
      .on('data', (row) => results.push(row))
      .on('end', () => {
        Promise.all(results.map(async (row) => {
          const coords = await getCoordinates(row.PORT, row.COUNTRY);
          row.Timezone = coords ? getTimezoneFromCoords(coords.lat, coords.lon) : 'UTC';
        }))
        .then(() => resolve(results))
        .catch(reject);
      })
      .on('error', reject);
  });
}



app.get('/', async (req, res) => {
  const data = await parseCSV();

  const grouped = {};
  data.forEach((entry) => {
    const ship = entry.Ship;
    if (!grouped[ship]) grouped[ship] = [];
    grouped[ship].push(entry);
  });

  const now = DateTime.now();

  const statuses = Object.entries(grouped).map(([ship, rawStops]) => {
    rawStops.sort((a, b) => new Date(a.DATE) - new Date(b.DATE));

    const stops = rawStops.map((entry, idx, arr) => {
      let arrival = DateTime.fromFormat(entry.ARRIVAL || '', 'yyyy-MM-dd HH:mm:ss', { zone: entry.Timezone });
      let departure = DateTime.fromFormat(entry.DEPARTURE || '', 'yyyy-MM-dd HH:mm:ss', { zone: entry.Timezone });

      if (!arrival.isValid && idx > 0) {
        const prev = DateTime.fromFormat(arr[idx - 1].DEPARTURE || '', 'yyyy-MM-dd HH:mm:ss', { zone: entry.Timezone });
        if (prev.isValid) arrival = prev;
      }

      if (!departure.isValid && idx < arr.length - 1) {
        const next = DateTime.fromFormat(arr[idx + 1].ARRIVAL || '', 'yyyy-MM-dd HH:mm:ss', { zone: entry.Timezone });
        if (next.isValid) departure = next;
      }

      return { ...entry, arrival, departure };
    });

    const currentStop = stops.find(stop => {
      const nowLocal = now.setZone(stop.Timezone);
      return nowLocal >= stop.arrival && nowLocal <= stop.departure;
    });

    return {
      ship,
      status: currentStop ? `At ${currentStop.PORT}` : 'In Transit',
      nextStops: stops.slice(0, 3),
    };
  });

  res.render('index', { statuses });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
