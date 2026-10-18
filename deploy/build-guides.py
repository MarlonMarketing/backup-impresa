"""Build the bundled, static beginner guides. Python is only a documentation tool."""
import html
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent


def inline(text):
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)

    def link(match):
        title, url = match.groups()
        lang = re.fullmatch(r"GUIDE\.(en|it|es)\.md", url)
        if lang:
            url = "/guide/" + lang[1]
        elif not url.startswith("https://"):
            prefix = "https://github.com/MarlonMarketing/backup-impresa/blob/v0.3.0/"
            url = prefix + (url[3:] if url.startswith("../") else "docs/" + url)
        return '<a href="' + url + '">' + title + "</a>"

    return re.sub(r"\[([^]]+)\]\(([^)]+)\)", link, escaped)


for language in ("en", "it", "es"):
    lines = (root / "docs" / ("GUIDE." + language + ".md")).read_text(encoding="utf-8").splitlines()
    output, code_lines = [], []
    code, table, listing = False, False, None

    def close_blocks():
        global table, listing
        if table:
            output.append("</tbody></table></div>")
            table = False
        if listing:
            output.append("</" + listing + ">")
            listing = None

    for line in lines:
        if line.startswith("```"):
            if code:
                output.append("<pre><code>" + html.escape("\n".join(code_lines)) + "</code></pre>")
                code_lines = []
            else:
                close_blocks()
            code = not code
            continue
        if code:
            code_lines.append(line)
            continue
        if not line:
            close_blocks()
            continue
        if line.startswith("|"):
            cells = [value.strip() for value in line.strip("|").split("|")]
            if all(re.fullmatch(r"[-: ]+", cell) for cell in cells):
                continue
            if not table:
                output.append('<div class="table-wrap"><table><thead><tr>' + "".join("<th>" + inline(cell) + "</th>" for cell in cells) + "</tr></thead><tbody>")
                table = True
            else:
                output.append("<tr>" + "".join("<td>" + inline(cell) + "</td>" for cell in cells) + "</tr>")
            continue
        item = re.match(r"^(\d+\. |\- )(.*)", line)
        if item:
            kind = "ul" if item[1] == "- " else "ol"
            if listing != kind:
                close_blocks()
                listing = kind
                output.append("<" + kind + ">")
            output.append("<li>" + inline(item[2]) + "</li>")
            continue
        close_blocks()
        if line.startswith("## "):
            output.append("<h2>" + inline(line[3:]) + "</h2>")
        elif line.startswith("# "):
            output.append("<h1>" + inline(line[2:]) + "</h1>")
        else:
            output.append("<p>" + inline(line) + "</p>")
    close_blocks()
    page = '<!doctype html><html lang="' + language + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Backup Impresa · Guide</title><link rel="stylesheet" href="/style.css"></head><body><main><a href="/">← Backup Impresa</a><article class="card guide">' + "\n".join(output) + "</article></main></body></html>"
    (root / "public" / ("guide-" + language + ".html")).write_text(page, encoding="utf-8", newline="\n")
    print("Built guide:", language)
