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
 * Clean up a torrent display name — strip site prefixes, quality tags, codecs, groups, etc.
 * Returns a human-readable title with year if found.
 */
export function cleanTorrentName(name: string): string {
  let cleaned = decodeURIComponent(name);

  // Replace dots/underscores with spaces
  cleaned = cleaned.replace(/[._]/g, ' ');

  // ── Strip leading site name prefixes ────────────────────────────────────
  // Patterns: "www.1TamilMV.pink -", "www.TamilBlasters.com -", "[YTS.MX]", etc.

  // Remove bracketed group tags at start: [YTS.MX], [TGx], (1TamilMV), etc.
  cleaned = cleaned.replace(/^(?:\[[^\]]*\]|\([^)]*\))\s*/g, '');

  // Remove "www<sep><sitename>[<sep><tld>][<sep><tag>] <sep>" prefix
  // Works with dots already replaced to spaces: "www 1TamilMV pink - "
  cleaned = cleaned.replace(
    /^www[\s.]+\S+[\s.]+(?:\S+[\s.]+)*?[-–—:]+\s*/i,
    '',
  );

  // Remove common release group color/label tags that precede the title
  // e.g., "pink -", "gold -", "teal -"
  cleaned = cleaned.replace(
    /^\s*(?:pink|gold|teal|green|red|blue|yellow|silver|purple|cyan|orange)\s*[-–—:]+\s*/i,
    '',
  );

  // Another pass for remaining leading junk like "- " after stripping
  cleaned = cleaned.replace(/^\s*[-–—:]+\s*/, '');

  // ── Extract year early (it helps with cutting) ──────────────────────────
  const yearMatch = cleaned.match(/\(?\b((?:19|20)\d{2})\b\)?/);
  const year = yearMatch ? yearMatch[1] : '';

  // ── Cut at quality/release markers ──────────────────────────────────────
  const cutPatterns = [
    /\b(720p|1080p|2160p|4[Kk]|UHD)\b/i,
    /\b(BluRay|Blu-Ray|BDRip|BRRip|WEB-?DL|WEB-?Rip|WEBRip|HDRip|DVDRip|DVDScr|HDTV|PDTV|CAMRip|HDCAM|HDR|SDR)\b/i,
    /\b(x264|x265|h\.?264|h\.?265|HEVC|AVC|XviD|DivX|AV1|10bit)\b/i,
    /\b(AAC|AAC2|AC3|DTS|DD5|DD2|FLAC|MP3|TrueHD|Atmos|EAC3|LPCM)\b/i,
    /\b(YIFY|YTS|RARBG|SPARKS|GECKOS|FGT|EVO|ETRG|STUTTERSHIT|AMZN|NF|DSNP|HMAX|ATVP|PCOK|MA)\b/i,
    /\b(REMASTERED|EXTENDED|UNRATED|PROPER|DIRECTORS CUT|IMAX|CRITERION|REMUX)\b/i,
    /\b(Dual Audio|Multi Audio|Hindi|Tamil|Telugu|English|ESub|ESubs|HQ)\b/i,
    /\bS\d{2}E\d{2}\b/i,
    /\bS\d{2}\b/i,
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

  // If we already found a year, also try cutting at the year boundary
  // to remove anything after it (e.g., "Spider-Man (2012) BluRay" → "Spider-Man (2012)")
  if (year) {
    const yearIdx = cleaned.search(/\(?\b(?:19|20)\d{2}\b\)?/);
    if (yearIdx >= 0) {
      const afterYear = cleaned.substring(yearIdx).replace(/\(?\b(?:19|20)\d{2}\b\)?\s*/, '');
      // If there's still junk after the year, cut it
      if (afterYear.trim().length > 0) {
        cleaned = cleaned.substring(0, yearIdx);
      }
    }
  }

  // Remove the year from the title text (we'll re-append it cleanly)
  if (year) {
    cleaned = cleaned.replace(/\(?\b(?:19|20)\d{2}\b\)?\s*/, '');
  }

  // ── Final cleanup ───────────────────────────────────────────────────────
  // Remove any residual quality/codec words that weren't caught by cut
  cleaned = cleaned.replace(
    /\b(BluRay|Blu-Ray|BDRip|BRRip|WEB-?DL|WEB-?Rip|HDRip|DVDRip|HDTV|HEVC|x264|x265|10bit|HDR|SDR|REMUX|720p|1080p|2160p|4K)\b/gi,
    '',
  );

  // Trim and collapse spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Remove trailing hyphens, brackets, or dashes
  cleaned = cleaned.replace(/[\s\-–—[\]()]+$/, '').trim();

  // Remove leading hyphens/dashes
  cleaned = cleaned.replace(/^[\s\-–—]+/, '').trim();

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
