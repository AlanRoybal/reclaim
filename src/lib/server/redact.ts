/**
 * PII redaction for the uploaded message corpus, following the approach in
 * texts-to-transformer: strip URLs, emails, and phone-number-shaped strings
 * before anything is stored or sent to a model.
 */
export function redactPII(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[EMAIL]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[PHONE]");
}
