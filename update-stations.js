const fs = require('fs');
const path = require('path');

// Rumus Haversine untuk menghitung jarak antara 2 koordinat GPS (dalam km)
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function updateStationsFromOCM() {
  const stationsPath = path.join(__dirname, 'stations.json');
  const ocmPath = path.join(__dirname, 'ocm_raw.json');

  if (!fs.existsSync(stationsPath)) {
    console.error('❌ File stations.json tidak ditemukan.');
    process.exit(1);
  }

  if (!fs.existsSync(ocmPath)) {
    console.error('❌ File ocm_raw.json tidak ditemukan. Jalankan crawler.js terlebih dahulu.');
    process.exit(1);
  }

  const stationsData = JSON.parse(fs.readFileSync(stationsPath, 'utf-8'));
  const ocmData = JSON.parse(fs.readFileSync(ocmPath, 'utf-8'));

  console.log(`Memproses ${stationsData.length} stasiun tol dengan ${ocmData.length} data mentah OCM...`);

  let matchedCount = 0;
  let operationalCount = 0;
  let offlineCount = 0;
  let unmatchedCount = 0;

  const MAX_MATCH_RADIUS_KM = 0.8; // Radius pencocokan rest area (800 meter)

  const updatedStations = stationsData.map(station => {
    if (!station.lat || !station.lng) return station;

    // Cari POI OCM terdekat dengan titik rest area
    let closestPOI = null;
    let minDistance = Infinity;

    for (const poi of ocmData) {
      if (!poi.AddressInfo || !poi.AddressInfo.Latitude || !poi.AddressInfo.Longitude) continue;

      const dist = getDistanceKm(
        station.lat,
        station.lng,
        poi.AddressInfo.Latitude,
        poi.AddressInfo.Longitude
      );

      if (dist < minDistance && dist <= MAX_MATCH_RADIUS_KM) {
        minDistance = dist;
        closestPOI = poi;
      }
    }

    let isOperational = false;

    if (closestPOI) {
      matchedCount++;
      const stationStatusId = closestPOI.StatusType ? closestPOI.StatusType.ID : null;

      // HANYA status 50 yang dianggap operasional, selain itu mati
      isOperational = (stationStatusId === 50);
    } else {
      unmatchedCount++;
      // Jika tidak terdata di OCM, cek apakah data lokal sebelumnya bernilai 50
      isOperational = (station.status === 50);
    }

    const statusCode = isOperational ? 50 : 100;

    if (isOperational) {
      operationalCount++;
    } else {
      offlineCount++;
    }

    // Sematkan field status ke setiap charger dan port
    const updatedChargers = (station.chargers || []).map(charger => {
      const updatedPorts = (charger.ports || []).map(port => ({
        ...port,
        status: statusCode
      }));

      return {
        ...charger,
        status: statusCode,
        ports: updatedPorts
      };
    });

    return {
      ...station,
      status: statusCode,
      chargers: updatedChargers
    };
  });

  fs.writeFileSync(stationsPath, JSON.stringify(updatedStations, null, 2), 'utf-8');

  console.log('\n✅ stations.json berhasil diperbarui dengan aturan ketat!');
  console.table({
    'Total Stasiun di Rute': stationsData.length,
    'Cocok dengan OCM': matchedCount,
    'Tidak Ditemukan di OCM': unmatchedCount,
    'Stasiun Operasional (Status 50)': operationalCount,
    'Stasiun Tidak Operasional (Status 100)': offlineCount
  });
}

updateStationsFromOCM();