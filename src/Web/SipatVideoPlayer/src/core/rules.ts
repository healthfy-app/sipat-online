export interface PlayerRules { watchInOrder?: boolean; fixedSpeed?: boolean }

export function clampSeek(targetS: number, unlockedS: number): { seconds: number; blocked: boolean } {
  return targetS > unlockedS + 0.25 ? { seconds: unlockedS, blocked: true } : { seconds: targetS, blocked: false };
}

export function unlockedSeconds(rules: PlayerRules, furthestS: number, currentS: number, durationS: number): number {
  return rules.watchInOrder ? Math.min(durationS, Math.max(furthestS, currentS)) : durationS;
}

export function bounceNativeSeek(rules: PlayerRules, currentS: number, furthestS: number): number | null {
  return rules.watchInOrder && currentS > furthestS + 1 ? furthestS : null;
}

export function enforcedRate(rules: PlayerRules, rate: number): number {
  return rules.fixedSpeed ? 1 : rate;
}
