import type { MediaType, MagnetInfo } from './types';

/**
 * Parse a magnet URI and extract metadata.
 */
export function parseMagnetUri(uri: string): MagnetInfo | null {
  if (!uri.startsWith('magnet:?')) return null;

  const params = new URLSearchParams(uri.slice('magnet:?'.length));
  const dn = params.get('dn') || '';
  const xt = params.get('xt') || '';

  // Extract info hash from xt=urn:btih:<hash>
  const hashMatch = xt.match(/urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  const infoHash = hashMatch ? hashMatch[1].toLowerCase() : '';

  if (!dn && !infoHash) return null;

  const cleanTitle = cleanTorrentName(dn);
  const type = isTVShow(dn) ? 'series' : 'movie';

  return { magnetUri: uri, infoHash, title: dn, cleanTitle, type };
}

/**
 * Clean up a torrent display name — strip quality tags, codecs, groups, etc.
 * Returns a human-readable title with year if found.
 */
export function cleanTorrentName(name: string): string {
  let cleaned = decodeURIComponent(name);

  // Replace dots/underscores with spaces
  cleaned = cleaned.replace(/[._]/g, ' ');

  // Cut at common quality/release markers
  const cutPatterns = [
    /\b(720p|1080p|2160p|4[Kk]|UHD)\b/,
    /\b(BluRay|BDRip|BRRip|WEB-?DL|WEB-?Rip|HDRip|DVDRip|HDTV|PDTV)\b/i,
    /\b(x264|x265|h\.?264|h\.?265|HEVC|AVC|XviD|DivX)\b/i,
    /\b(AAC|AC3|DTS|DD5|FLAC|MP3|TrueHD|Atmos)\b/i,
    /\b(YIFY|YTS|RARBG|SPARKS|GECKOS|FGT|EVO|ETRG|STUTTERSHIT)\b/i,
    /\b(REMASTERED|EXTENDED|UNRATED|PROPER|DIRECTORS CUT|IMAX)\b/i,
    /\bS\d{2}E\d{2}\b/i, // cut at episode marker
    /\bS\d{2}\b/i, // cut at season marker
    /\bSeason \d+/i,
    /\bComplete Season/i,
  ];

  for (const pattern of cutPatterns) {
    const match = cleaned.search(pattern);
    if (match > 0) {
      cleaned = cleaned.substring(0, match);
      break;
    }
  }

  // Extract year
  const yearMatch = cleaned.match(/\(?\b((?:19|20)\d{2})\b\)?/);
  const year = yearMatch ? yearMatch[1] : '';

  // Remove the year from the title, then re-append it cleanly
  if (year) {
    cleaned = cleaned.replace(/\(?\b(?:19|20)\d{2}\b\)?/, '');
  }

  // Trim and collapse spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Remove trailing hyphens or brackets
  cleaned = cleaned.replace(/[-[\]()]+$/, '').trim();

  return year ? `${cleaned} (${year})` : cleaned;
}

/**
 * Determine whether a torrent name is a TV show based on naming patterns.
 */
export function isTVShow(name: string): boolean {
  const tvPatterns = [
    /S\d{2}E\d{2}/i, // S01E01
    /S\d{2}/i, // S01 (season pack)
    /\d{1,2}x\d{2}/i, // 1x01
    /Season[\s._]\d+/i, // Season.1
    /Complete[\s._]Season/i, // Complete.Season
    /Series[\s._]\d+/i, // Series.1
    /\bMiniSeries\b/i, // MiniSeries
    /\bE\d{2}\b/i, // E01
  ];

  return tvPatterns.some((p) => p.test(name));
}
