"""Korean News RSS feed skill executor."""

import logging
from typing import Any

import feedparser

from ..base import SkillExecutor

logger = logging.getLogger(__name__)

# Korean news RSS feeds — tested and working
_RSS_FEEDS: dict[str, tuple[str, str]] = {
    # (display_name, rss_url)
    "yonhap": ("Yonhap News", "https://www.yna.co.kr/rss/news.xml"),
    "sbs": ("SBS News", "https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01&plink=RSSREADER"),
    "donga": ("Donga Ilbo", "https://rss.donga.com/total.xml"),
    "hankyoreh": ("Hankyoreh", "https://www.hani.co.kr/rss/"),
    "kyunghyang": ("Kyunghyang Shinmun", "https://www.khan.co.kr/rss/rssdata/total_news.xml"),
    "nocutnews": ("NoCut News", "https://rss.nocutnews.co.kr/nocutnews.xml"),
    "fnnews": ("Financial News", "https://www.fnnews.com/rss/fn_realnews_all.xml"),
    "segye": ("Segye Ilbo", "https://rss.segye.com/segye_recent.xml"),
}

_SOURCE_ALIASES: dict[str, str] = {
    "연합뉴스": "yonhap", "연합": "yonhap",
    "sbs뉴스": "sbs",
    "동아일보": "donga", "동아": "donga",
    "한겨레": "hankyoreh",
    "경향신문": "kyunghyang", "경향": "kyunghyang",
    "노컷뉴스": "nocutnews", "노컷": "nocutnews",
    "파이낸셜뉴스": "fnnews", "파이낸셜": "fnnews",
    "세계일보": "segye", "세계": "segye",
}


class KrNewsExecutor(SkillExecutor):
    name = "krnews"

    def __init__(self, config):
        pass

    def is_configured(self) -> bool:
        return True

    async def execute(self, params: dict[str, Any]) -> str:
        source = params.get("source", "")
        query = params.get("query", "")
        max_results = min(params.get("max_results", 10), 30)

        # Resolve source alias
        if source:
            key = source.lower().strip()
            key = _SOURCE_ALIASES.get(key, key)
            if key not in _RSS_FEEDS:
                available = ", ".join(
                    f"{k} ({v[0]})" for k, v in _RSS_FEEDS.items()
                )
                return f"[SKILL_ERROR] Unknown source: {source}. Available: {available}"
            return self._fetch_single(key, query, max_results)

        # No source specified: fetch from all feeds
        return self._fetch_all(query, max_results)

    def _fetch_single(self, key: str, query: str, max_results: int) -> str:
        display_name, url = _RSS_FEEDS[key]
        try:
            feed = feedparser.parse(url)
            entries = feed.entries
            if query:
                q_lower = query.lower()
                entries = [
                    e for e in entries
                    if q_lower in e.get("title", "").lower()
                    or q_lower in e.get("summary", "").lower()
                ]
            entries = entries[:max_results]

            if not entries:
                msg = f"No articles found from {display_name}"
                if query:
                    msg += f" matching '{query}'"
                return msg

            lines = [f"**{display_name}** ({len(entries)} articles)\n"]
            for i, entry in enumerate(entries, 1):
                title = entry.get("title", "No title")
                link = entry.get("link", "")
                published = entry.get("published", "")
                lines.append(f"{i}. **{title}**")
                if published:
                    lines.append(f"   {published}")
                if link:
                    lines.append(f"   [Read article]({link})")
                lines.append("")

            logger.info("krnews fetched %d articles from %s", len(entries), display_name)
            return "\n".join(lines)
        except Exception as e:
            logger.warning("krnews fetch failed for %s: %s", key, e)
            return f"[SKILL_ERROR] Failed to fetch {display_name}: {str(e)}"

    def _fetch_all(self, query: str, max_results: int) -> str:
        all_articles: list[tuple[str, dict]] = []
        per_feed = max(max_results // len(_RSS_FEEDS), 3)

        for key, (display_name, url) in _RSS_FEEDS.items():
            try:
                feed = feedparser.parse(url)
                for entry in feed.entries[:per_feed]:
                    if query:
                        q_lower = query.lower()
                        if (q_lower not in entry.get("title", "").lower()
                                and q_lower not in entry.get("summary", "").lower()):
                            continue
                    all_articles.append((display_name, entry))
            except Exception as e:
                logger.warning("krnews feed %s failed: %s", key, e)

        if not all_articles:
            msg = "No Korean news articles found"
            if query:
                msg += f" matching '{query}'"
            return msg

        articles = all_articles[:max_results]
        lines = [f"**Korean News Headlines** ({len(articles)} articles)\n"]
        for i, (source_name, entry) in enumerate(articles, 1):
            title = entry.get("title", "No title")
            link = entry.get("link", "")
            lines.append(f"{i}. [{source_name}] **{title}**")
            if link:
                lines.append(f"   [Read article]({link})")
            lines.append("")

        logger.info("krnews fetched %d articles total", len(articles))
        return "\n".join(lines)
