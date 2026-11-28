const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const usd = (micro: number | null) => micro === null ? 'Unknown' : money.format(micro / 1_000_000);
export const day = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const clock = (ms: number) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
export const share = (part: number, whole: number) => whole > 0 ? Math.min(100, Math.max(0, Math.round(part * 100 / whole))) : 0;
