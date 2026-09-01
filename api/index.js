import fs from 'fs';
import path from 'path';

// ==========================================
// ⚙️ CONFIGURATION (UPSTREAM API & BRANDING)
// ==========================================
const UPSTREAM_API_CONFIG = {
  url: "https://numinfo100ms.ghddys32.workers.dev/?mobile={query}",
  timeout: 15000
};

const BRAND_CONFIG = {
  developer: "@Zeno098",
  telegram: "@Zeno098",
  bot: "@No2infobot",
  whatsapp: "+63 9620658587",
  contact: "WhatsApp: +63 9620658587 | Telegram: @Zeno098"
};

// Helper: Clean and format fields
const cleanValue = (val) => {
  if (val === null || val === undefined || val === "null" || val === "undefined" || val === "N/A" || val === "") {
    return "Not Found";
  }
  const cleaned = String(val)
    .replace(/!+/g, ', ')
    .replace(/^[^a-zA-Z0-9\s,.-]+/g, '')
    .trim();
  return cleaned.length > 0 ? cleaned : "Not Found";
};

// Helper: Parse Plain Text Blocks into Objects
function parsePlainText(text) {
  const records = [];
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const entry = {};
    const lines = block.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.slice(0, colonIndex).trim().toLowerCase();
        const val = line.slice(colonIndex + 1).trim();

        if (key.includes('father')) {
          entry.fatherName = val;
        } else if (key.includes('name')) {
          entry.name = val;
        } else if (key.includes('phone') || key.includes('mobile')) {
          entry.number = val;
        } else if (key.includes('address')) {
          entry.address = val;
        } else if (key.includes('circle') || key.includes('region')) {
          entry.circle = val;
        } else if (key.includes('email')) {
          entry.email = val;
        } else if (key.includes('document') || key.includes('id') || key.includes('passport')) {
          entry.idNumber = val;
        } else if (key.includes('alt')) {
          entry.alternateNumber = val;
        }
      }
    }
    if (Object.keys(entry).length > 0) {
      records.push(entry);
    }
  }
  return records;
}

// ==========================================
// 🚀 MAIN API HANDLER
// ==========================================
export default async function handler(req, res) {
  const { num, Key } = req.query;

  // 1. Check Missing API Key
  if (!Key) {
    return res.status(401).json({
      success: false,
      message: `API key missing! To BUY this API, message on ${BRAND_CONFIG.contact}`,
      buy_contact: BRAND_CONFIG.whatsapp,
      telegram: BRAND_CONFIG.telegram,
      bot: BRAND_CONFIG.bot,
      developer: BRAND_CONFIG.developer
    });
  }

  // 2. Load Keys Database
  const dbPath = path.join(process.cwd(), 'keys.json');
  let keysData = {};

  if (fs.existsSync(dbPath)) {
    try {
      keysData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
      return res.status(500).json({ success: false, message: "Error reading keys database." });
    }
  }

  // 3. Validate Key
  const userRecord = keysData[Key];
  if (!userRecord) {
    return res.status(403).json({
      success: false,
      message: `Invalid API key! To BUY a valid API, message on ${BRAND_CONFIG.contact}`,
      buy_contact: BRAND_CONFIG.whatsapp,
      telegram: BRAND_CONFIG.telegram,
      bot: BRAND_CONFIG.bot,
      developer: BRAND_CONFIG.developer
    });
  }

  // 4. Expiry Date Check
  const startDate = new Date(userRecord.startDate);
  const expiryDate = new Date(startDate);
  expiryDate.setDate(expiryDate.getDate() + (userRecord.days || 30));

  const currentTime = new Date();
  if (currentTime > expiryDate) {
    return res.status(403).json({
      success: false,
      message: `This API expired on ${expiryDate.toDateString()}! To RENEW, contact ${BRAND_CONFIG.contact}`,
      buy_contact: BRAND_CONFIG.whatsapp,
      telegram: BRAND_CONFIG.telegram,
      bot: BRAND_CONFIG.bot,
      developer: BRAND_CONFIG.developer
    });
  }

  // 5. Daily Limit Tracking
  const todayStr = currentTime.toISOString().split('T')[0];
  const dailyLimit = userRecord.dailyLimit || 100;

  if (!userRecord.usage || userRecord.usage.date !== todayStr) {
    userRecord.usage = {
      date: todayStr,
      count: 0
    };
  }

  if (userRecord.usage.count >= dailyLimit) {
    return res.status(429).json({
      success: false,
      message: `Daily limit reached! Limit is ${dailyLimit} req/day. Try tomorrow or upgrade.`,
      daily_limit: dailyLimit,
      used_today: userRecord.usage.count,
      buy_contact: BRAND_CONFIG.whatsapp,
      developer: BRAND_CONFIG.developer
    });
  }

  // 6. Validate Number Parameter
  if (!num) {
    return res.status(400).json({
      success: false,
      message: "num parameter missing. Please provide a valid mobile number."
    });
  }

  try {
    // 7. Request Upstream API
    const targetUrl = UPSTREAM_API_CONFIG.url.replace('{query}', encodeURIComponent(num));
    const response = await fetch(targetUrl, { signal: AbortSignal.timeout(UPSTREAM_API_CONFIG.timeout) });

    if (!response.ok) {
      return res.status(response.status).json({ success: false, message: "Upstream API error" });
    }

    const rawResponseText = await response.text();

    // Increment usage
    userRecord.usage.count += 1;
    keysData[Key] = userRecord;
    try {
      fs.writeFileSync(dbPath, JSON.stringify(keysData, null, 2), 'utf8');
    } catch (e) {
      console.error("Could not write usage data to disk", e);
    }

    // 8. Extraction (Supports JSON and Plain Text)
    let rawRecords = [];

    try {
      const parsedJSON = JSON.parse(rawResponseText);
      function extractRecords(obj) {
        if (!obj) return;
        if (Array.isArray(obj)) {
          obj.forEach(item => extractRecords(item));
          return;
        }
        if (typeof obj === 'object') {
          if (Array.isArray(obj.records)) {
            rawRecords.push(...obj.records);
          } else if (
            obj.full_name || obj.name || obj.nick || obj.phone ||
            obj.mobile || obj.the_name_of_the_father || obj.fname || obj.address
          ) {
            rawRecords.push(obj);
          }
          if (obj.data) extractRecords(obj.data);
          if (obj.result) extractRecords(obj.result);
          if (obj.results) extractRecords(obj.results);
        }
      }
      extractRecords(parsedJSON);
    } catch {
      rawRecords = parsePlainText(rawResponseText);
    }

    if (!rawRecords || rawRecords.length === 0) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(JSON.stringify({
        status: false,
        message: "Database mein data nahi hai (Data not found)",
        number: num,
        developer: BRAND_CONFIG.developer,
        bot: BRAND_CONFIG.bot,
        bought_from: BRAND_CONFIG.contact
      }, null, 2));
    }

    // Format & map fields
    const formattedRecords = rawRecords.map(record => ({
      name: cleanValue(record.full_name || record.name || record.nick),
      fatherName: cleanValue(record.the_name_of_the_father || record.fname || record.father_name || record.fatherName),
      address: cleanValue(record.address),
      circle: cleanValue(record.region || record.circle),
      number: cleanValue(record.phone || record.mobile || record.number || num),
      alternateNumber: cleanValue(record.alt || record.alt_mobile || record.alternateNumber),
      idNumber: cleanValue(record.document_number || record.passport_number || record.id || record.idNumber || record.aadhar),
      email: cleanValue(record.email)
    })).filter(r => r.name !== "Not Found" || r.fatherName !== "Not Found" || r.address !== "Not Found");

    // Deduplicate records
    const uniqueRecords = formattedRecords.filter((value, index, self) =>
      index === self.findIndex((t) => (
        t.name === value.name &&
        t.fatherName === value.fatherName &&
        t.address === value.address &&
        t.number === value.number
      ))
    );

    if (uniqueRecords.length === 0) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(JSON.stringify({
        status: false,
        message: "Database mein data nahi hai (Data not found)",
        number: num,
        bot: BRAND_CONFIG.bot,
        developer: BRAND_CONFIG.developer,
        bought_from: BRAND_CONFIG.contact
      }, null, 2));
    }

    // 9. Structured Final Output
    const cleanResponse = {
      status: true,
      message: "Data fetched successfully",
      api_user: userRecord.name || "VIP User",
      number: num,
      usage: {
        limit: dailyLimit,
        used_today: userRecord.usage.count,
        remaining: dailyLimit - userRecord.usage.count
      },
      total_records: uniqueRecords.length,
      details: uniqueRecords,
      developer: BRAND_CONFIG.developer,
      bot: BRAND_CONFIG.bot,
      bought_from: BRAND_CONFIG.contact,
      notice: "This API is exclusively for active users.",
      buy_more: `To buy more APIs, contact ${BRAND_CONFIG.contact}`
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(JSON.stringify(cleanResponse, null, 2));

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
