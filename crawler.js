require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Ambil API key dari file .env
const OCM_API_KEY = process.env.OCM_API_KEY;

if (!OCM_API_KEY) {
  console.error("❌ Error: Variabel OCM_API_KEY belum disetel di dalam file .env!");
  process.exit(1);
}

async function fetchRawOCMData() {
  const url = `https://api.openchargemap.io/v3/poi?countrycode=ID&maxresults=3000&key=${OCM_API_KEY}`;
  
  console.log("Mulai mengambil data mentah dari Open Charge Map...");
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const rawData = await response.json();
    console.log(`✅ Berhasil mengambil ${rawData.length} data lokasi SPKLU.`);
    
    // Ringkasan status operasional stasiun
    const statusSummary = {
      Operational: 0,
      Error_Offline: 0,
      Maintenance_Planned: 0,
      Unknown: 0
    };

    rawData.forEach(station => {
      const statusId = station.StatusType ? station.StatusType.ID : null;
      if (statusId === 50) statusSummary.Operational++;
      else if (statusId === 100) statusSummary.Error_Offline++;
      else if (statusId === 75 || statusId === 150 || statusId === 30) statusSummary.Maintenance_Planned++;
      else statusSummary.Unknown++;
    });

    console.log("\n📊 Ringkasan Status (Data Mentah):");
    console.table(statusSummary);

    const outputPath = path.join(__dirname, 'ocm_raw.json');
    fs.writeFileSync(outputPath, JSON.stringify(rawData, null, 2), 'utf-8');
    
    console.log(`\n💾 Data mentah berhasil disimpan di: ${outputPath}`);
  } catch (error) {
    console.error("❌ Gagal mengambil data dari OCM:", error);
  }
}

fetchRawOCMData();