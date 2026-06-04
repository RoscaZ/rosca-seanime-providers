/// <reference path="./online-streaming-provider.d.ts" />

class Provider {
  constructor() {
    this.base = "https://anidao.to";
  }

  getSettings() {
    return {
      episodeServers: [
        "HD-2 SUB",
        "StreamHG SUB",
        "Earnvids SUB",
      ],
      supportsDub: false,
    };
  }

  async search(query) {
    var searchUrl = this.base + "/search?q=" + encodeURIComponent(query.query);
    var res = await fetch(searchUrl);
    var html = await res.text();
    var results = [];

    var cardRegex = /<article class="an-anime-card">([\s\S]*?)<\/article>/g;
    var match;

    while ((match = cardRegex.exec(html)) !== null) {
      var card = match[1];
      var hrefMatch = card.match(/<a class="an-anime-card__image"[^>]+href="([^"]+)"/);
      var titleMatch = card.match(/<a class="an-anime-card__image"[^>]+title="([^"]+)"/);
      if (!hrefMatch || !titleMatch) continue;

      var url = this.base + hrefMatch[1];
      var title = titleMatch[1].trim();
      results.push({
        id: url,
        title: title,
        url: url,
        subOrDub: "sub",
      });
    }

    if (!results.length) throw new Error("No anime found for: " + query.query);
    return results;
  }

  async findEpisodes(id) {
    var res = await fetch(id);
    var html = await res.text();
    var episodes = [];

    var rowRegex = /<article class="an-episode-row">([\s\S]*?)<\/article>/g;
    var match;

    while ((match = rowRegex.exec(html)) !== null) {
      var row = match[1];
      var hrefMatch = row.match(/<a class="an-episode-row__thumb"[^>]+href="([^"]+)"/);
      var titleMatch = row.match(/<h3 class="an-episode-row__title"><a[^>]+>([^<]+)<\/a>/);
      if (!hrefMatch) continue;

      var epUrl = this.base + hrefMatch[1];
      var epTitle = titleMatch ? titleMatch[1].trim() : "";
      var numberMatch = hrefMatch[1].match(/episode-(\d+)$/i);
      var number = numberMatch ? parseInt(numberMatch[1]) : 0;

      episodes.push({
        id: epUrl,
        title: epTitle,
        number: number,
        url: epUrl,
      });
    }

    var seenUrls = {};
    var seenNumbers = {};
    var deduped = [];
    for (var i = 0; i < episodes.length; i++) {
      var ep = episodes[i];
      if (seenUrls[ep.url]) continue;
      if (ep.number !== 0 && seenNumbers[ep.number]) continue;
      seenUrls[ep.url] = true;
      if (ep.number !== 0) seenNumbers[ep.number] = true;
      deduped.push(ep);
    }

    deduped.sort(function(a, b) { return a.number - b.number; });
    return deduped;
  }

  async findEpisodeServer(episode, server) {
    var res = await fetch(episode.url);
    var html = await res.text();

    var serverBtnMap = {
      "HD-2 SUB":     ["hsub-2", "sub-2"],
      "StreamHG SUB": ["hsub-3", "sub-3"],
      "Earnvids SUB": ["hsub-4", "sub-4"],
    };

    var btnKeys = serverBtnMap[server];
    if (!btnKeys) throw new Error("Unknown server: " + server);

    var embedUrl = null;
    for (var i = 0; i < btnKeys.length; i++) {
      var key = btnKeys[i];
      var btnRegex = new RegExp('data-an-server-btn="' + key + '"[^>]+data-an-video="([^"]+)"', "i");
      var btnRegex2 = new RegExp('data-an-video="([^"]+)"[^>]+data-an-server-btn="' + key + '"', "i");
      var m = html.match(btnRegex) || html.match(btnRegex2);
      if (m) { embedUrl = m[1]; break; }
    }

    if (!embedUrl) throw new Error("No embed URL found for server: " + server);

    // vibeplayer.site (HD-2)
    if (embedUrl.indexOf("vibeplayer.site") !== -1) {
      var embedRes = await fetch(embedUrl);
      var embedHtml = await embedRes.text();
      var srcMatch = embedHtml.match(/src\s*=\s*["']([^"']+\.m3u8[^"']*)["']/i)
        || embedHtml.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/);
      if (srcMatch) {
        return {
          server: server,
          videoSources: [{ url: srcMatch[1], quality: "auto", type: "hls" }],
        };
      }
    }

    // otakuhg.site (StreamHG)
    if (embedUrl.indexOf("otakuhg.site") !== -1) {
      var embedRes2 = await fetch(embedUrl);
      var embedHtml2 = await embedRes2.text();
      var unpacked2 = this.unPack(embedHtml2);
      if (unpacked2) {
        var m3u8Match = unpacked2.match(/"(?:hls2|hls3|hls4|hls)":\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
        if (m3u8Match) return { server: server, videoSources: [{ url: m3u8Match[1], quality: "auto", type: "hls" }] };
        var anyM3u8 = unpacked2.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/);
        if (anyM3u8) return { server: server, videoSources: [{ url: anyM3u8[1], quality: "auto", type: "hls" }] };
      }
    }

    // otakuvid.online (Earnvids)
    if (embedUrl.indexOf("otakuvid.online") !== -1) {
      var embedRes3 = await fetch(embedUrl, { headers: { Referer: embedUrl } });
      var embedHtml3 = await embedRes3.text();
      var unpacked3 = this.unPack(embedHtml3);
      if (unpacked3) {
        var m3u8Match2 = unpacked3.match(/"(?:hls2|hls3|hls4|hls)":\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/);
        if (m3u8Match2) return { server: server, headers: { Referer: embedUrl }, videoSources: [{ url: m3u8Match2[1], quality: "auto", type: "hls" }] };
        var anyM3u82 = unpacked3.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/);
        if (anyM3u82) return { server: server, headers: { Referer: embedUrl }, videoSources: [{ url: anyM3u82[1], quality: "auto", type: "hls" }] };
      }
    }

    throw new Error("Could not extract stream from: " + embedUrl);
  }

  unPack(code) {
    var regex = /eval\(function\(p,a,c,k,e,(?:r|d)\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/;
    var match = code.match(regex);
    if (!match) return null;

    var p = match[1];
    var a = parseInt(match[2]);
    var c = parseInt(match[3]);
    var k = match[4].split("|");

    var e = function(n) {
      return (n < a ? "" : e(Math.floor(n / a))) +
        ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
    };

    for (var i = c - 1; i >= 0; i--) {
      if (k[i]) {
        p = p.replace(new RegExp("\\b" + e(i) + "\\b", "g"), k[i]);
      }
    }

    return p.replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
}
