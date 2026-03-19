/**
 * Adaptive progress estimation using n/(n+K) formula.
 *
 * K adapts based on historical turn tool counts:
 * - Default K = 10
 * - If history available, K = average of last 3 turns' tool counts * 0.8
 *
 * Progress is capped at 0.95 to never show "complete" prematurely.
 */
export function calculateProgress(
  toolCount: number,
  turnToolCounts: number[],
): number {
  let k = 10;

  if (turnToolCounts.length > 0) {
    // Use up to last 3 entries
    const recent = turnToolCounts.slice(-3);
    const avg = recent.reduce((sum, n) => sum + n, 0) / recent.length;
    if (avg > 0) {
      k = avg * 0.8;
    }
  }

  // Avoid division by zero when both are 0
  if (toolCount <= 0) return 0;

  const progress = toolCount / (toolCount + k);
  return Math.min(0.95, progress);
}

/**
 * Format a human-readable progress label.
 */
export function formatProgressLabel(toolCount: number): string {
  if (toolCount === 1) return '1 tool';
  return `${toolCount} tools`;
}
