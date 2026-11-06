export const TierStatus = { Failed: 'failed', TimedOut: 'timed-out' } as const;

export type TierStatus = (typeof TierStatus)[keyof typeof TierStatus];
