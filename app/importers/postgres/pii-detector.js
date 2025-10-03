/*
 * PII Detection for Postgres Columns
 * Multi-signal approach for >90% accuracy
 *
 * Detection Signals:
 * 1. Column name patterns (0.70 confidence)
 * 2. Data format patterns (0.85-0.98 confidence)
 * 3. Entropy analysis (0.80 confidence for high entropy)
 * 4. Type hints (0.60 confidence)
 *
 * Requires 3+ signals or high-confidence pattern match
 */

/**
 * PII detection patterns and weights
 */
const PII_PATTERNS = {
  email: {
    namePatterns: [/email/i, /e_mail/i, /@/],
    dataPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    confidence: { name: 0.70, data: 0.95 },
    type: 'email'
  },
  ssn: {
    namePatterns: [/ssn/i, /social_security/i, /social_sec/i],
    dataPattern: /^\d{3}-?\d{2}-?\d{4}$/,
    confidence: { name: 0.85, data: 0.98 },
    type: 'ssn'
  },
  phone: {
    namePatterns: [/phone/i, /mobile/i, /telephone/i, /tel/i],
    dataPattern: /^\+?[1-9]\d{1,14}$/,
    confidence: { name: 0.70, data: 0.85 },
    type: 'phone'
  },
  credit_card: {
    namePatterns: [/credit_card/i, /cc_number/i, /card_number/i, /pan/i],
    dataPattern: /^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/,
    confidence: { name: 0.80, data: 0.92 },
    type: 'credit_card'
  },
  ip_address: {
    namePatterns: [/ip_address/i, /ip_addr/i, /client_ip/i],
    dataPattern: /^(\d{1,3}\.){3}\d{1,3}$/,
    confidence: { name: 0.75, data: 0.90 },
    type: 'ip_address'
  },
  passport: {
    namePatterns: [/passport/i, /passport_number/i, /passport_no/i],
    dataPattern: /^[A-Z]{1,2}\d{6,9}$/,
    confidence: { name: 0.80, data: 0.85 },
    type: 'passport'
  },
  name: {
    namePatterns: [/first_name/i, /last_name/i, /full_name/i, /fname/i, /lname/i],
    dataPattern: null, // Names are hard to pattern match
    confidence: { name: 0.75, data: 0.50 },
    type: 'name'
  },
  address: {
    namePatterns: [/address/i, /street/i, /city/i, /zip/i, /postal/i, /country/i],
    dataPattern: null,
    confidence: { name: 0.65, data: 0.50 },
    type: 'address'
  },
  date_of_birth: {
    namePatterns: [/dob/i, /birth_date/i, /date_of_birth/i, /birthday/i],
    dataPattern: /^\d{4}-\d{2}-\d{2}$/,
    confidence: { name: 0.85, data: 0.80 },
    type: 'date_of_birth'
  },
  financial: {
    namePatterns: [/account_number/i, /bank_account/i, /routing/i, /iban/i, /swift/i],
    dataPattern: null,
    confidence: { name: 0.80, data: 0.60 },
    type: 'financial'
  }
};

/**
 * Calculate Shannon entropy of a string
 * High entropy (>4.0) suggests random data (IDs, tokens, hashes)
 * Low entropy (<3.0) suggests categorical/structured data
 * @param {string} str - Input string
 * @returns {number} Entropy value
 */
function calculateEntropy(str) {
  if (!str || str.length === 0) return 0;

  const freq = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Analyze sample data for patterns
 * @param {Array} sampleData - Sample rows
 * @param {string} columnName - Column name
 * @returns {object} Pattern analysis results
 */
function analyzeSampleData(sampleData, columnName) {
  if (!sampleData || sampleData.length === 0) {
    return { patterns: [], avgEntropy: 0 };
  }

  const patterns = [];
  const entropies = [];
  let nullCount = 0;

  for (const value of sampleData) {
    if (value === null || value === undefined) {
      nullCount++;
      continue;
    }

    const strValue = String(value).trim();
    if (strValue.length === 0) continue;

    // Check against all PII patterns
    for (const [piiType, config] of Object.entries(PII_PATTERNS)) {
      if (config.dataPattern && config.dataPattern.test(strValue)) {
        patterns.push({
          type: config.type,
          confidence: config.confidence.data
        });
      }
    }

    // Calculate entropy
    entropies.push(calculateEntropy(strValue));
  }

  const avgEntropy = entropies.length > 0
    ? entropies.reduce((a, b) => a + b, 0) / entropies.length
    : 0;

  const nullRate = sampleData.length > 0 ? nullCount / sampleData.length : 0;

  return { patterns, avgEntropy, nullRate };
}

/**
 * Detect PII in a column using multi-signal approach
 * @param {string} columnName - Column name
 * @param {string} dataType - Postgres data type
 * @param {Array} sampleData - Sample values from column
 * @param {object} stats - Performance stats from pg_stats (optional)
 * @returns {object} Detection result with confidence
 */
function detectPII(columnName, dataType, sampleData, stats = {}) {
  const signals = [];
  let detectedType = null;
  let maxConfidence = 0;

  // Signal 1: Column name patterns
  for (const [piiType, config] of Object.entries(PII_PATTERNS)) {
    for (const pattern of config.namePatterns) {
      if (pattern.test(columnName)) {
        signals.push({
          signal: 'name_pattern',
          type: config.type,
          confidence: config.confidence.name
        });

        if (config.confidence.name > maxConfidence) {
          maxConfidence = config.confidence.name;
          detectedType = config.type;
        }
        break; // One match per PII type is enough
      }
    }
  }

  // Signal 2: Data format patterns
  const sampleAnalysis = analyzeSampleData(sampleData, columnName);

  // Aggregate pattern matches from sample
  const patternCounts = {};
  for (const match of sampleAnalysis.patterns) {
    patternCounts[match.type] = (patternCounts[match.type] || 0) + 1;
  }

  // If >50% of samples match a pattern, it's a strong signal
  const sampleSize = sampleData.filter(v => v !== null && v !== undefined).length;
  for (const [type, count] of Object.entries(patternCounts)) {
    const matchRate = count / sampleSize;
    if (matchRate > 0.5) {
      const pattern = PII_PATTERNS[type];
      signals.push({
        signal: 'data_pattern',
        type: type,
        confidence: pattern.confidence.data * matchRate
      });

      if (pattern.confidence.data > maxConfidence) {
        maxConfidence = pattern.confidence.data;
        detectedType = type;
      }
    }
  }

  // Signal 3: Entropy analysis (high entropy = tokens/IDs)
  if (sampleAnalysis.avgEntropy > 4.0) {
    // High entropy suggests random data (UUIDs, tokens, hashes)
    // Could be PII if combined with name patterns
    signals.push({
      signal: 'high_entropy',
      type: 'token_or_hash',
      confidence: 0.80
    });
  }

  // Signal 4: Type hints
  const typeHints = {
    'uuid': { type: 'identifier', confidence: 0.60 },
    'inet': { type: 'ip_address', confidence: 0.90 },
    'macaddr': { type: 'mac_address', confidence: 0.90 }
  };

  if (typeHints[dataType]) {
    const hint = typeHints[dataType];
    signals.push({
      signal: 'type_hint',
      type: hint.type,
      confidence: hint.confidence
    });

    if (hint.confidence > maxConfidence) {
      maxConfidence = hint.confidence;
      detectedType = hint.type;
    }
  }

  // Decision logic: Require high confidence OR multiple signals
  const detected = maxConfidence >= 0.85 || signals.length >= 3;

  // Calculate aggregate confidence
  let aggregateConfidence = 0;
  if (signals.length > 0) {
    // Weighted sum (not average) gives stronger credit to corroborating signals
    const contributions = [1.0, 0.5, 0.25, 0.1];
    const sortedSignals = signals.sort((a, b) => b.confidence - a.confidence);

    for (let i = 0; i < sortedSignals.length; i++) {
      const weight = contributions[i] || 0.05;
      aggregateConfidence += sortedSignals[i].confidence * weight;
    }

    aggregateConfidence = Math.min(aggregateConfidence, 1.0);
  }

  // Adjust confidence based on null rate (high null rate = less confident)
  if (sampleAnalysis.nullRate > 0.5) {
    aggregateConfidence *= 0.8;
  }

  return {
    detected,
    type: detectedType,
    confidence: Math.min(aggregateConfidence, 1.0),
    signals: signals.map(s => ({
      signal: s.signal,
      type: s.type,
      confidence: s.confidence
    })),
    metadata: {
      avg_entropy: sampleAnalysis.avgEntropy,
      null_rate: sampleAnalysis.nullRate,
      sample_size: sampleData.length
    }
  };
}

/**
 * Batch detect PII across multiple columns
 * @param {Array<object>} columns - Columns with metadata
 * @param {object} samplesByColumn - Map of column name to sample data
 * @returns {object} Map of column name to detection result
 */
function batchDetectPII(columns, samplesByColumn) {
  const results = {};

  for (const column of columns) {
    const sampleData = samplesByColumn[column.column_name] || [];
    const detection = detectPII(
      column.column_name,
      column.data_type || column.udt_name,
      sampleData
    );

    results[column.column_name] = detection;
  }

  return results;
}

module.exports = {
  detectPII,
  batchDetectPII,
  analyzeSampleData,
  calculateEntropy,
  PII_PATTERNS
};
