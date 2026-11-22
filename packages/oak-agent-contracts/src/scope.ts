/** A claimless decline of a request outside Steve's work ("I only cover Steve's work, so no poems"): nothing was missing
 * to name, so it need not scope an absence like other gaps (P14: an ocean-poem request failed every time without it).
 * Shared with the site (R22) so such a turn reads "Outside Steve's work" instead of an evidence gap. No imports. */
export function scopeDecline(text: string) {
  // The same sentence must decline ("so I won't…", "can't help with…"); an in-scope gap still names what was missing.
  return text.split(/(?<=[.!?])\s+/).some(sentence => /\b(?:so|can['\u2019]t|cannot|won['\u2019]t|do not|don['\u2019]t|not|outside)\b/i.test(sentence) && /\b(?:I|I['\u2019]m|I am)\b[^.!?]{0,40}\b(?:only|just|set up to|here to|focus(?:ed)? on)\b[^.!?]{0,60}\b(?:Steve|his)\b[^.!?]{0,20}\b(?:work|projects|career|experience|portfolio)\b/i.test(sentence));
}
