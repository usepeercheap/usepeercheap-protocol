// Live market. Reads only the market config handed to it by the page.
import { fetchJson } from './poller.js';

const CHUNK = 30;
export const TOP_N = 10;

const num = (v) => { const n = Number(v); return isFinite(n) ? n : null; };

export function pickBestPairs(pairs, wanted) {
  const best = new Map();
  for (const p of pairs) {
    const addr = p?.baseToken?.address;
    if (!addr || !wanted.has(addr)) continue;
    const vol = num(p.volume?.h24) ?? 0;
    const cur = best.get(addr);
    if (!cur || vol > (num(cur.volume?.h24) ?? 0)) best.set(addr, p);
  }
  return best;
}

export function toToken(p) {
  return {
    address: p.baseToken.address,
    symbol: p.baseToken.symbol || '',
    name: p.baseToken.name || '',
    price: num(p.priceUsd),
    change: num(p.priceChange?.h24),
    volume: num(p.volume?.h24),
    liquidity: num(p.liquidity?.usd),
    image: p.info?.imageUrl || null,
  };
}

export async function fetchMarket(cfg, signal) {
  const boosts = await fetchJson(cfg.url, signal);
  if (!Array.isArray(boosts)) throw new Error('Unexpected boosts payload');
  const addrs = [...new Set(boosts.filter((b) => b?.chainId === 'solana' && b.tokenAddress).map((b) => b.tokenAddress))];
  if (!addrs.length) throw new Error('No Solana entries');
  const wanted = new Set(addrs);
  const batches = [];
  for (let i = 0; i < addrs.length; i += CHUNK) batches.push(addrs.slice(i, i + CHUNK));
  const results = await Promise.all(batches.map((b) => fetchJson(cfg.pairsUrl.replace('{addresses}', b.join(',')), signal)));
  const pairs = results.flat().filter(Boolean);
  const best = pickBestPairs(pairs, wanted);
  const tokens = [...best.values()].map(toToken).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  if (!tokens.length) throw new Error('No pairs returned');
  return tokens.slice(0, TOP_N);
}
