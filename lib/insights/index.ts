// Typed STUB — implemented by feature agent B6 (Dashboard/Insights).
// Builds anonymized aggregates → OpenAI (gpt-5.4) → Hebrew insights, cached in
// insights_cache.

export async function generateInsights(
  _periodDays: number,
): Promise<{ stats: object; text: string }> {
  throw new Error('NOT_IMPLEMENTED: generateInsights');
}
