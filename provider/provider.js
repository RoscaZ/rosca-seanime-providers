/// <reference path="./online-streaming-provider.d.ts" />

// Miruro-style provider for Seanime
// Source: Consumet API (gogoanime) — same backend Miruro uses
// Audio: SUB only (English subtitles guaranteed)
// Compatible with Seanime ES5 engine — no Node.js APIs

var CONSUMET_BASE = "https://api.consumet.org";

class Provider {
  constructor() {
    this.base = CONSUMET_BASE;
  }

  getSettings() {
    return {
      episodeServers: ["Gogocdn SUB", "Vidstreaming SUB"],
      supportsDub: false,
    };
  }

  async search(query) {
    var url = this.base + "/anime/gogoanime/" + encodeURIComponent(query.query);
    var res = await fetch(url);
    var data = await res.json();

    if (!data || !data.results || !data.results.length) {
      throw new Error("No results found for: " + query.query);
    }

    var results = [];
    for (var i = 0; i < data.results.length; i++) {
      var item = data.results[i];
      results.push({
        id: item.id,
        title: item.title,
        url: item.url || "",
        subOrDub: "sub",
      });
    }

    return results;
  }

  async findEpisodes(id) {
    var url = this.base + "/anime/gogoanime/info/" + encodeURIComponent(id);
    var res = await fetch(url);
    var data = await res.json();

    if (!data || !data.episodes || !data.episodes.length) {
      throw new Error("No episodes found for: " + id);
    }

    var episodes = [];
    for (var i = 0; i < data.episodes.length; i++) {
      var ep = data.episodes[i];
      episodes.push({
        id: ep.id,
        title: ep.title || ("Episode " + ep.number),
        number: ep.number,
        url: ep.url || "",
      });
    }

    return episodes;
  }

  async findEpisodeServer(episode, server) {
    var serverParam = "gogocdn";
    if (server === "Vidstreaming SUB") {
      serverParam = "vidstreaming";
    }

    var url = this.base + "/anime/gogoanime/watch/" + encodeURIComponent(episode.id) + "?server=" + serverParam;
    var res = await fetch(url);
    var data = await res.json();

    if (!data || !data.sources || !data.sources.length) {
      // Fallback: try the other server
      var fallbackServer = serverParam === "gogocdn" ? "vidstreaming" : "gogocdn";
      var fallbackUrl = this.base + "/anime/gogoanime/watch/" + encodeURIComponent(episode.id) + "?server=" + fallbackServer;
      var fallbackRes = await fetch(fallbackUrl);
      data = await fallbackRes.json();

      if (!data || !data.sources || !data.sources.length) {
        throw new Error("No stream found for episode: " + episode.id);
      }
    }

    var sources = [];
    for (var i = 0; i < data.sources.length; i++) {
      var src = data.sources[i];
      if (!src.url) continue;

      var isHls = src.isM3U8 === true || src.url.indexOf(".m3u8") !== -1;
      sources.push({
        url: src.url,
        quality: src.quality || "auto",
        type: isHls ? "hls" : "mp4",
      });
    }

    if (!sources.length) {
      throw new Error("No valid sources for episode: " + episode.id);
    }

    // Sort: put "1080p" or best quality first
    sources.sort(function(a, b) {
      var qa = parseInt(a.quality) || 0;
      var qb = parseInt(b.quality) || 0;
      return qb - qa;
    });

    var result = {
      server: server,
      videoSources: sources,
    };

    // Include subtitles if returned (some sources return VTT)
    if (data.subtitles && data.subtitles.length) {
      var englishSubs = [];
      for (var j = 0; j < data.subtitles.length; j++) {
        var sub = data.subtitles[j];
        if (sub.lang && sub.lang.toLowerCase().indexOf("eng") !== -1) {
          englishSubs.push(sub);
        }
      }
      if (englishSubs.length) {
        result.subtitles = englishSubs;
      }
    }

    // Pass through any headers required by the source
    if (data.headers) {
      result.headers = data.headers;
    }

    return result;
  }
}
