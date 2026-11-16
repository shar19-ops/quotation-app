"""開発版HTMLから配布用の単一HTMLファイルを作る。

使い方:
  python tools/build_bundle.py vendor  <出力ファイル名>   # 見積書【雄電社書式】.html → 業者配布用
  python tools/build_bundle.py staff   <出力ファイル名>   # 見積書【社員用】.html   → 社員用配布用

やっていること(これまで手作業で行っていた単一HTML化と同じ):
  - <link rel="stylesheet" href="style.css"> を <style> に埋め込む
  - src="assets/*.png" の画像を base64 の data URL に置き換える
  - <script src="..."></script> を中身ごと埋め込む("</script" は "<\\/script" にエスケープ)
  - <script id="pdfWorkerB64"> に pdfjs/pdf.worker.min.js を base64 で埋め込む
"""
import base64
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "vendor": "見積書【雄電社書式】.html",
    "staff": "見積書【社員用】.html",
}


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def data_url(path):
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon"}[Path(path).suffix.lower()]
    return f"data:{mime};base64," + base64.b64encode((ROOT / path).read_bytes()).decode("ascii")


def build(kind):
    html = read(SOURCES[kind]).replace("\r\n", "\n")

    css = read("style.css").replace("\r\n", "\n")
    html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css.rstrip("\n") + "\n</style>")

    html = re.sub(r'src="(assets/[^"]+)"', lambda m: f'src="{data_url(m.group(1))}"', html)

    worker = base64.b64encode((ROOT / "pdfjs/pdf.worker.min.js").read_bytes()).decode("ascii")
    html = html.replace(
        '<script id="pdfWorkerB64" type="text/plain" style="display:none"></script>',
        f'<script id="pdfWorkerB64" type="text/plain" style="display:none">{worker}</script>')

    def inline_script(m):
        js = read(m.group(1)).replace("\r\n", "\n").replace("</script", "<\\/script")
        return "<script>\n" + js.rstrip("\n") + "\n</script>"
    html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)
    return html


if __name__ == "__main__":
    kind, out = sys.argv[1], sys.argv[2]
    (ROOT / out).write_text(build(kind), encoding="utf-8", newline="\r\n")
    print("built", out)
