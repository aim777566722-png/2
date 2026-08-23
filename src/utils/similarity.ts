// Utility for Arabic & English medicine name normalization, similarity scoring, near-duplicate detection, and alias matching

const normalizeCache = new Map<string, string>();

/**
 * Normalizes Arabic and English text for accurate phonetic and semantic comparison
 */
export function normalizeMedicineName(str: string): string {
  if (!str) return '';
  if (normalizeCache.has(str)) {
    return normalizeCache.get(str)!;
  }

  const normalized = str
    .toLowerCase()
    // Remove Arabic diacritics / tashkeel
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Normalize Arabic letters
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // Separate numbers and adjacent letters: "زواجرا50" -> "زواجرا 50"
    .replace(/([^\d\s])(\d+)/g, '$1 $2')
    .replace(/(\d+)([^\d\s])/g, '$1 $2')
    // Remove extra non-alphanumeric characters except spaces and numbers
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();

  if (normalizeCache.size > 5000) {
    normalizeCache.clear();
  }
  normalizeCache.set(str, normalized);
  return normalized;
}

const DOSAGE_UNITS_MAP: Record<string, string> = {
  'مجم': 'مجم',
  'ملج': 'مجم',
  'ملجم': 'مجم',
  'mg': 'مجم',
  'جم': 'جم',
  'جرام': 'جم',
  'g': 'جم',
  'مل': 'مل',
  'ملي': 'مل',
  'ml': 'مل',
  'مايكرو': 'مايكرو',
  'mcg': 'مايكرو',
  'iu': 'وحدة',
  'وحدة': 'وحدة'
};

const COMPANY_AND_FORM_STOPWORDS = new Set([
  'شركة', 'شركه', 'معامل', 'مصنع', 'مستودع', 'فارما', 'شفاكوا', 'جلفار', 'تبوك', 
  'الحكمة', 'حكمة', 'سبأ', 'سبافارما', 'العالمية', 'عالمية', 'سيد', 'النيل', 'مصر', 
  'الاسكندرية', 'ممفيس', 'ابوت', 'فايزر', 'نوفارتس', 'سانوفي', 'جي اس كي', 'gsk', 
  'pharma', 'lab', 'labs', 'co', 'ltd', 'inc', 'corp', 'حبوب', 'اقراص', 'قرص', 
  'كبسول', 'كبسولات', 'شراب', 'مرهم', 'كريم', 'امبول', 'حقن', 'قطرة', 'بخاخ', 
  'شريط', 'علبة', 'باكت', 'تحاميل', 'فوار', 'سيرب', 'syrup', 'tab', 'tabs', 'cap', 'caps'
]);

/**
 * Extracts numeric dosages (e.g. 50, 100, 500, 1000) from medicine name
 */
export function extractDosageNumbers(str: string): string[] {
  const norm = normalizeMedicineName(str);
  const matches = norm.match(/\b\d+(\.\d+)?\b/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Extracts core medicine identity tokens, stripping company and pharmaceutical form words
 */
export function extractCoreMedicineTokens(str: string): string[] {
  const norm = normalizeMedicineName(str);
  const tokens = norm.split(' ').filter(Boolean);
  return tokens.filter(t => {
    if (COMPANY_AND_FORM_STOPWORDS.has(t)) return false;
    if (DOSAGE_UNITS_MAP[t]) return false;
    return true;
  });
}

/**
 * Calculates Levenshtein Distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix = Array.from({ length: bn + 1 }, (_, i) => [i]);
  for (let j = 0; j <= an; j++) matrix[0][j] = j;

  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

const similarityCache = new Map<string, number>();

/**
 * Calculates similarity ratio between 0.0 (completely different) and 1.0 (identical)
 * considering dosage numbers, company suffixes, and phonetic similarity
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeMedicineName(str1);
  const norm2 = normalizeMedicineName(str2);

  if (norm1 === norm2) return 1.0;
  if (!norm1 || !norm2) return 0.0;

  const cacheKey = norm1 < norm2 ? `${norm1}|||${norm2}` : `${norm2}|||${norm1}`;
  if (similarityCache.has(cacheKey)) {
    return similarityCache.get(cacheKey)!;
  }

  // Check dosage numbers mismatch (e.g. 50mg vs 100mg must NOT match)
  const nums1 = extractDosageNumbers(norm1);
  const nums2 = extractDosageNumbers(norm2);
  if (nums1.length > 0 && nums2.length > 0) {
    const hasCommonNum = nums1.some(n => nums2.includes(n));
    if (!hasCommonNum) {
      // Different dosage strength (e.g. 25 vs 50 vs 100) -> heavily penalize
      similarityCache.set(cacheKey, 0.35);
      return 0.35;
    }
  }

  // Core tokens comparison (without company names)
  const core1 = extractCoreMedicineTokens(norm1);
  const core2 = extractCoreMedicineTokens(norm2);
  const coreStr1 = core1.join(' ');
  const coreStr2 = core2.join(' ');

  if (coreStr1 && coreStr2 && coreStr1 === coreStr2) {
    similarityCache.set(cacheKey, 0.96);
    return 0.96;
  }

  // Exact substring match on normalized string
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const minLen = Math.min(norm1.length, norm2.length);
    const maxLen = Math.max(norm1.length, norm2.length);
    if (minLen / maxLen > 0.5) {
      const score = 0.85 + 0.15 * (minLen / maxLen);
      similarityCache.set(cacheKey, score);
      return score;
    }
  }

  // Substring match on core tokens
  if (coreStr1 && coreStr2 && (coreStr1.includes(coreStr2) || coreStr2.includes(coreStr1))) {
    const minLen = Math.min(coreStr1.length, coreStr2.length);
    const maxLen = Math.max(coreStr1.length, coreStr2.length);
    if (minLen / maxLen > 0.5) {
      const score = 0.80 + 0.15 * (minLen / maxLen);
      similarityCache.set(cacheKey, score);
      return score;
    }
  }

  // Token-based Jaccard / Dice overlap
  const tokens1 = new Set(core1.length > 0 ? core1 : norm1.split(' ').filter(Boolean));
  const tokens2 = new Set(core2.length > 0 ? core2 : norm2.split(' ').filter(Boolean));
  let intersectionCount = 0;
  tokens1.forEach(t => {
    if (tokens2.has(t)) intersectionCount++;
  });
  const tokenScore = (2 * intersectionCount) / (tokens1.size + tokens2.size);

  // Levenshtein-based score on core or normalized string
  const targetStr1 = coreStr1 || norm1;
  const targetStr2 = coreStr2 || norm2;
  const maxLen = Math.max(targetStr1.length, targetStr2.length);
  const dist = levenshteinDistance(targetStr1, targetStr2);
  const levScore = Math.max(0, 1 - dist / maxLen);

  // Weighted average
  const finalScore = Math.max(0, Math.min(1, tokenScore * 0.5 + levScore * 0.5));

  if (similarityCache.size > 8000) {
    similarityCache.clear();
  }
  similarityCache.set(cacheKey, finalScore);
  return finalScore;
}

export interface NearMatchResult {
  existingMedicine: { id: string; name: string; category?: string; aliases?: string[] };
  similarityScore: number;
  isExact: boolean;
  isNearMatch: boolean; // similarity between 0.60 and 0.99
  matchedVia?: 'canonical_name' | 'alias' | 'core_name';
  matchedAlias?: string;
}

export interface SimilarityConflict {
  id: string;
  candidateName: string;
  existingMedicine: { id: string; name: string; category?: string; aliases?: string[]; [key: string]: any };
  similarityScore: number;
  unitPrice?: number;
  supplierName?: string;
  quantity?: number;
  bonusScheme?: string;
  originalIndex?: number;
}

/**
 * Checks a candidate medicine name against a list of known medicines to find exact or near matches,
 * actively inspecting canonical names and registered aliases.
 */
export function findSimilarMedicine(
  candidateName: string,
  knownMedicines: Array<{ id: string; name: string; category?: string; aliases?: string[] }>
): NearMatchResult | null {
  if (!candidateName || !knownMedicines || knownMedicines.length === 0) return null;

  const candidateNorm = normalizeMedicineName(candidateName);
  let bestMatch: NearMatchResult | null = null;
  let highestScore = 0;

  for (const med of knownMedicines) {
    const medNorm = normalizeMedicineName(med.name);
    
    // 1. Direct exact canonical match
    if (candidateNorm === medNorm) {
      return {
        existingMedicine: med,
        similarityScore: 1.0,
        isExact: true,
        isNearMatch: false,
        matchedVia: 'canonical_name'
      };
    }

    // 2. Direct exact match with any registered alias
    if (Array.isArray(med.aliases) && med.aliases.length > 0) {
      for (const alias of med.aliases) {
        if (!alias) continue;
        const aliasNorm = normalizeMedicineName(alias);
        if (candidateNorm === aliasNorm) {
          return {
            existingMedicine: med,
            similarityScore: 1.0,
            isExact: true,
            isNearMatch: false,
            matchedVia: 'alias',
            matchedAlias: alias
          };
        }
      }
    }

    // 3. Compute highest similarity score against canonical name and aliases
    let score = calculateSimilarity(candidateName, med.name);
    let matchedAliasName: string | undefined = undefined;

    if (Array.isArray(med.aliases) && med.aliases.length > 0) {
      for (const alias of med.aliases) {
        if (!alias) continue;
        const aliasScore = calculateSimilarity(candidateName, alias);
        if (aliasScore > score) {
          score = aliasScore;
          matchedAliasName = alias;
        }
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = {
        existingMedicine: med,
        similarityScore: score,
        isExact: score >= 0.98,
        isNearMatch: score >= 0.60 && score < 0.98,
        matchedVia: matchedAliasName ? 'alias' : 'canonical_name',
        matchedAlias: matchedAliasName
      };
    }
  }

  if (bestMatch && (bestMatch.isExact || bestMatch.isNearMatch)) {
    return bestMatch;
  }

  return null;
}

/**
 * Returns a sorted list of top similar medicines for interactive user selection / suggestions
 */
export function findTopSimilarMedicines(
  candidateName: string,
  knownMedicines: Array<{ id: string; name: string; category?: string; aliases?: string[] }>,
  limit: number = 4,
  minScore: number = 0.45
): Array<{
  medicine: { id: string; name: string; category?: string; aliases?: string[] };
  similarityScore: number;
  isExact: boolean;
  matchedAlias?: string;
}> {
  if (!candidateName || !knownMedicines || knownMedicines.length === 0) return [];

  const candidateNorm = normalizeMedicineName(candidateName);
  const results: Array<{
    medicine: { id: string; name: string; category?: string; aliases?: string[] };
    similarityScore: number;
    isExact: boolean;
    matchedAlias?: string;
  }> = [];

  for (const med of knownMedicines) {
    const medNorm = normalizeMedicineName(med.name);
    let bestScore = candidateNorm === medNorm ? 1.0 : calculateSimilarity(candidateName, med.name);
    let matchedAlias: string | undefined = undefined;

    if (Array.isArray(med.aliases)) {
      for (const alias of med.aliases) {
        if (!alias) continue;
        const aliasNorm = normalizeMedicineName(alias);
        const aliasScore = candidateNorm === aliasNorm ? 1.0 : calculateSimilarity(candidateName, alias);
        if (aliasScore > bestScore) {
          bestScore = aliasScore;
          matchedAlias = alias;
        }
      }
    }

    if (bestScore >= minScore) {
      results.push({
        medicine: med,
        similarityScore: bestScore,
        isExact: bestScore >= 0.98,
        matchedAlias
      });
    }
  }

  return results.sort((a, b) => b.similarityScore - a.similarityScore).slice(0, limit);
}
