const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('stations.json', 'utf8'));

const compressed = raw.map(s => {
  const stationObj = {
    seg: s.segment,
    sd: s.side,
    km: s.km,
    n: s.name,
    lat: s.lat,
    lng: s.lng
  };

  // Hanya cantumkan status jika offline (100)
  if (s.status === 100) stationObj.s = 100;

  stationObj.c = (s.chargers || []).map(ch => {
    const chargerObj = {
      b: ch.brand,
      p: (ch.ports || []).map(pt => {
        // Normalisasi string power "100~200 kW" menjadi angka integer tertinggi
        const kwVal = pt.power_max || parseInt(String(pt.power).replace(/[^0-9]/g, ''), 10) || 0;
        const portObj = {
          t: pt.type,
          kw: kwVal
        };
        if (pt.status === 100) portObj.s = 100;
        return portObj;
      })
    };
    if (ch.status === 100) chargerObj.s = 100;
    return chargerObj;
  });

  return stationObj;
});

fs.writeFileSync('stations.json', JSON.stringify(compressed), 'utf8');
console.log('✅ stations.json berhasil dikompresi!');