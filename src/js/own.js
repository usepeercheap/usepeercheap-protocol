// Own token row model. Only this module reads the CA state.
import { fetchJson } from './poller.js';

export const LOGO_FALLBACK = 'assets/logo-192.png';
export const LOGO_BRAND = 'brand/peer-logo.png';

export function selectPair(pairs, ca) {
  const own = (Array.isArray(pairs) ? pairs : []).filter((p) => p?.baseToken?.address === ca);
  own.sort((a, b) => (Number(b.volume?.h24) || 0) - (Number(a.volume?.h24) || 0));
  return own[0] || null;
}

export function buildOwnModel(dex, pump, ca) {
  const pair = selectPair(dex?.pairs, ca);
  console.log('[peer] own token raw response', { dex, pump });
  if (!pair) return null;
  const liq = Number(pair.liquidity?.usd);
  const candidates = { liquidityUsd: pair.liquidity?.usd ?? null, marketCap: pair.marketCap ?? null, fdv: pair.fdv ?? null };
  console.log('[peer] own liquidity candidates', candidates);
  const useLiq = isFinite(liq) && liq > 0;
  const mcap = Number(pair.marketCap);
  return {
    address: ca,
    symbol: pair.baseToken.symbol || 'PEER',
    name: pair.baseToken.name || 'PEER',
    price: Number(pair.priceUsd) || null,
    change: isFinite(Number(pair.priceChange?.h24)) ? Number(pair.priceChange.h24) : null,
    volume: isFinite(Number(pair.volume?.h24)) ? Number(pair.volume.h24) : null,
    liquidity: useLiq ? liq : (isFinite(mcap) && mcap > 0 ? mcap : null),
    liquidityLabel: useLiq ? 'Liquidity' : 'Mkt Cap',
    image: pump?.image_uri || LOGO_FALLBACK,
  };
}

export async function fetchOwn(cfg, ca, signal, get = fetchJson) {
  const [dex, pump] = await Promise.all([
    get(cfg.url.replace('{ca}', ca), signal),
    get(cfg.imageUrl.replace('{ca}', ca), signal).catch(() => null),
  ]);
  return buildOwnModel(dex, pump, ca);
}
