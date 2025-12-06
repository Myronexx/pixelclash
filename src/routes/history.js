import http from 'http';
import https from 'https';

import logger from '../core/logger.js';
import { BACKUP_URL } from '../core/config.js';

const TIME_CACHE = new Map();

/*
 * parse nginx index page and return file and directory names
 * @param html html string
 * @return Array of files
 */
function getFilesFromHtml(html) {
  const links = [];
  let l = html.indexOf('href="');
  while (l !== -1) {
    const m = html.indexOf('"', l + 6);
    if (m !== -1) {
      let link = html.substring(l + 6, m);

      // klasör trailing slash sil
      if (link.endsWith('/')) link = link.slice(0, -1);

      // baştaki ./ veya / temizle
      while (link.startsWith('.') || link.startsWith('/')) {
        link = link.substring(1);
      }

      // tiles klasörü özel: her zaman 0000 olarak döner
      if (link === 'tiles') links.unshift('0000');

      // sadece webp dosyası ise ekle
      else if (link.endsWith('.webp')) links.push(link);

      // saat klasörleri (1430, 1520) → sadece sayı
      else if (/^\d+$/.test(link)) links.push(link);
    }
    l = html.indexOf('href="', l + 7);
  }
  return links;
}


/*
 * fetch available times of day from backup server
 */
function fetchTimesOfDay(yyyy, mm, dd, id, cacheTime, url) {
  const key = `${yyyy}/${mm}/${dd}/${id}`;
  const cache = TIME_CACHE.get(key);

  if (cache) {
    const threshold = Date.now() - cacheTime * 1000;
    if (cache[1] >= threshold) {
      return cache[0];
    }
    TIME_CACHE.delete(key);
  }

  const reqUrl = url || `${BACKUP_URL}/${key}/`;
  const protocol = reqUrl.startsWith('http:') ? http : https;

  return new Promise((resolve, reject) => {
    protocol.get(reqUrl, (res) => {
      switch (res.statusCode) {
        case 200: {
          res.setEncoding('utf8');
          const data = [];
          res.on('data', (chunk) => data.push(chunk));

          res.on('end', () => {
            try {
              const result = getFilesFromHtml(data.join('')).filter((n) => {
                // saat klasörü veya webp tile olsun
                return /^\d+$/.test(n) || n.endsWith('.webp');
              });

              TIME_CACHE.set(key, [result, Date.now()]);
              resolve(result);

            } catch (err) {
              reject(new Error(`Parse error on ${key}: ${err.message}`));
            }
          });
          break;
        }

        case 404:
          resolve([]);
          break;

        case 301:
          if (res.headers.location && !url) {
            resolve(fetchTimesOfDay(yyyy, mm, dd, id, cacheTime, res.headers.location));
            break;
          }
        // FALLTHROUGH

        default:
          reject(new Error(`HTTP ${res.statusCode} for ${key}`));
      }

    }).on('error', (err) => {
      reject(new Error(`Fetch error ${key}: ${err.message}`));
    });
  });
}



//
// MAIN ROUTE
//
async function history(req, res) {
  req.tickRateLimiter(500);

  const { day, id } = req.query;

  if (!BACKUP_URL || !day || !id ||
      day.includes('/') || day.includes('\\') || day.length !== 8) {
    res.status(404).end();
    return;
  }

  const yyyy = day.slice(0, 4);
  const mm   = day.slice(4, 6);
  const dd   = day.slice(6);

  const parsedTs = new Date(`${yyyy}-${mm}-${dd}`).getTime();

  // Bugün / dün ise → 30 dk, eski ise → 5 saat cache
  let cacheTime = (Date.now() - parsedTs < 48 * 3600 * 1000)
    ? 30 * 60
    : 300 * 60;

  try {
    const result = await fetchTimesOfDay(yyyy, mm, dd, id, cacheTime);

    if (!result.length) cacheTime = 3600; // boş ise kısa cache

    res.set({
      "Cache-Control": `public, max-age=${cacheTime}`
    });

    res.json(result);

  } catch (err) {
    logger.warn(err.message);
    res.status(400).end();
  }
}

export default history;
