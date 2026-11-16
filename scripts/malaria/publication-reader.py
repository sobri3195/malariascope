"""Read actual HTML anchors and Poppler text using only Python's standard library."""

import json
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


class IndexParser(HTMLParser):
    def __init__(self, base):
        super().__init__(convert_charrefs=True)
        self.base = base
        self.links = []
        self.stack = []
        self.anchor = None
        self.heading = None
        self.ignore = 0
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style"):
            self.ignore += 1
        if self.ignore:
            return
        if tag in ("article", "li", "div"):
            self.stack.append({"tag": tag, "text": [], "links": [], "date": None, "headings": []})
        if tag in HEADINGS:
            self.heading = []
        if tag == "time" and attrs.get("datetime") and self.stack:
            self.stack[-1]["date"] = attrs["datetime"][:10]
        if tag == "meta" and attrs.get("property", attrs.get("name")) in (
            "article:published_time", "date", "datePublished"
        ):
            self.meta["publishedAt"] = attrs.get("content", "")[:10]
        if tag == "a" and attrs.get("href"):
            self.anchor = {
                "href": urljoin(self.base, attrs["href"]),
                "title": attrs.get("title", ""),
                "text": [],
                "publishedAt": attrs.get("data-published-at"),
            }
        if tag in ("a", "link") and "next" in attrs.get("rel", "").split() and attrs.get("href"):
            self.links.append({"href": urljoin(self.base, attrs["href"]), "title": "", "next": True})

    def handle_data(self, data):
        if self.ignore:
            return
        if self.anchor:
            self.anchor["text"].append(data)
        if self.heading is not None:
            self.heading.append(data)
        for container in self.stack:
            container["text"].append(data)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.ignore = max(0, self.ignore - 1)
            return
        if self.ignore:
            return
        if tag in HEADINGS and self.heading is not None:
            if self.stack:
                self.stack[-1]["headings"].append(" ".join(self.heading).strip())
            self.heading = None
        if tag == "a" and self.anchor:
            link, self.anchor = self.anchor, None
            label = " ".join(link.pop("text")).strip()
            link["title"] = link["title"] or label
            self.links.append(link)
            if self.stack:
                self.stack[-1]["links"].append(link)
        if self.stack and tag == self.stack[-1]["tag"]:
            container = self.stack.pop()
            for link in container["links"]:
                if not link.get("publishedAt") and container["date"]:
                    link["publishedAt"] = container["date"]
                if not link.get("publicationTitle") and len(container["headings"]) == 1:
                    link["publicationTitle"] = container["headings"][0]
                link.setdefault("context", " ".join(container["text"])[:6000])
            if self.stack:
                self.stack[-1]["links"].extend(container["links"])
                self.stack[-1]["headings"].extend(container["headings"])


def main():
    mode, path = sys.argv[1:3]
    if mode == "index":
        parser = IndexParser(sys.argv[3])
        parser.feed(Path(path).read_text(encoding="utf-8"))
        print(json.dumps({"links": parser.links, **parser.meta}))
    elif mode == "pdf":
        result = subprocess.run(
            ["pdftotext", "-layout", path, "-"], capture_output=True, check=True, timeout=45
        )
        if len(result.stdout) > 16 * 1024 * 1024:
            raise ValueError("PDF text exceeds size limit")
        pages = result.stdout.decode("utf-8").split("\f")
        print(json.dumps([{"page": i + 1, "text": text} for i, text in enumerate(pages) if text.strip()]))
    else:
        raise ValueError("Unknown reader mode")


if __name__ == "__main__":
    main()
