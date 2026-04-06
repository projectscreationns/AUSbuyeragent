/**
 * Extract JSON from an agent's text response.
 * Tries: fenced ```json blocks first, then raw { } or [ ] detection.
 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') return null;

  // Try fenced JSON block
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }

  // Try any fenced block
  const anyFence = text.match(/```\s*([\s\S]*?)```/);
  if (anyFence) {
    try { return JSON.parse(anyFence[1].trim()); } catch {}
  }

  // Try raw JSON object
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) {
    try { return JSON.parse(text.slice(objStart, objEnd + 1)); } catch {}
  }

  // Try raw JSON array
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    try { return JSON.parse(text.slice(arrStart, arrEnd + 1)); } catch {}
  }

  return null;
}

/**
 * Validate that parsed data has required keys. Returns { valid, missing }.
 */
export function validateShape(data, requiredKeys) {
  if (!data || typeof data !== 'object') return { valid: false, missing: requiredKeys };
  const missing = requiredKeys.filter(k => !(k in data));
  return { valid: missing.length === 0, missing };
}

/**
 * Count null/missing values in a data object for quality warnings.
 */
export function countNulls(data) {
  if (!data || typeof data !== 'object') return 0;
  let count = 0;
  for (const val of Object.values(data)) {
    if (val === null || val === undefined || val === '') count++;
    else if (typeof val === 'object' && !Array.isArray(val)) count += countNulls(val);
  }
  return count;
}
