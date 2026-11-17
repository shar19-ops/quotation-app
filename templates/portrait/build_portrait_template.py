"""A4縦の見積書帳票(背景画像)を作る。

使い方:  python templates/portrait/build_portrait_template.py
出力:    assets/{blue,red}_bg_portrait.png      1ページ目 (200dpi, 1654x2339px)
         assets/{blue,red}_bg_portrait_cont.png 内訳ページ(「ページ追加」で増える2ページ目以降)

- 配置は「見積書レイアウト参考.pdf」(雄電社の御見積書)に合わせている:
  上段左に宛名・見積総額(下線+大きな数字)・工事情報(下線の行)、上段右に業者見積日/番号・業者情報・
  業者コード・業者担当者印、下段に明細表(15行+合計)・注記欄(5行)・社内確認用の押印枠4つ(正方形)。
- タイトル「御 見 積 書」(見積書の3文字 + ロゴの「御中」の「御」)、社名ロゴ「株式会社 雄電社 御中」、
  「下記の通りお見積り申し上げます。」は
  A4横の帳票(assets/{blue,red}_bg.png)から切り出して使う。それ以外の文字・罫線はここで描く。
- 座標はすべて mm。アプリ側(script.js / script-employee.js の PORTRAIT_*)の印字位置も同じ mm の値で
  定義しているので、ここで位置を変えたら両スクリプトも合わせて直すこと。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"
FONT = r"C:\Windows\Fonts\YuGothM.ttc"

DPI = 200
W, H = 1654, 2339  # A4縦 200dpi

# 綴じ代: 帳票全体を右へずらす量(mm)。左余白 12+6=18mm、右余白 12-6=6mm になる。
# 下の座標はずらす前(左右余白12mm)の値。アプリ側は style.css の .orient-portrait .overlay-layer の left で同じだけずらす
BINDING_MM = 6


def px(mm):
    return round(mm * DPI / 25.4)


# 横帳票から切り出す部品: (切り出し範囲 [横帳票 px@200dpi], 配置先 左上 (mm), 縮尺)
CROPS = {
    "logo":    ((247, 223, 921, 292), (12, 25), 0.8),  # 株式会社 雄電社 御中
    "message": ((249, 303, 768, 339), (13, 34.5), 0.75),  # 下記の通りお見積り申し上げます。
}
TITLE_TOP = 13

# タイトル「御 見 積 書」: 横帳票のタイトル「見 積 書」の3文字に、社名ロゴ「御中」の「御」(同じ書体)を加えて組む
# (切り出し範囲 [横帳票 px@200dpi], 縮尺)。「御」は少し小さいので見積書の文字の高さ(約53px)にそろえる
TITLE_GLYPHS = [
    ((827, 240, 872, 289), 1.08),   # 御 (社名ロゴの「御中」から)
    ((967, 146, 1016, 200), 1.0),   # 見
    ((1101, 146, 1154, 200), 1.0),  # 積
    ((1241, 146, 1292, 200), 1.0),  # 書
]
TITLE_PITCH = 137.5  # 文字の中心の間隔(横帳票のタイトルと同じ)
TITLE_SCALE = 0.9

# 左上: 見積総額・法定福利費
TOTAL = {"label": (13, 48.5), "line_y": 52.5, "line_x": (12, 108), "yen": (102.5, 48.5)}
WELFARE = {"y": 57.5, "left": 15, "right_text_x": 79}

# 左: 工事情報(下線の行)。幅は見積総額の下線と同じ。各行は下線の y と項目名
PROJECT_X = (12, 108)
PROJECT_LABEL_X = 13
PROJECT_ROWS = [  # (下線 y, 項目名)
    (69, "本支店区分"),
    (77, "工　　番"),
    (85, "工 事 名"),
    (93, "施工場所"),
    (101, "工　　期"),
    (109, "見積有効期限"),
]
PERIOD_MARKS = [(51.4, "年"), (59.9, "月"), (68.4, "日"), (73, "～"), (86.9, "年"), (95.4, "月"), (103.9, "日")]
VALID_MARKS = [(42, "見積日より"), (71.4, "日間")]

# 右上: 業者見積日・番号(項目名は業者情報と同じ 112mm にそろえる)
QUOTE_DATE = {"label": (112, 27.5), "marks": [(161, "年"), (173, "月"), (185, "日")]}
QUOTE_NO = {"label": (112, 35), "dai": 135, "go": 193.5}
QUOTE_LINE_X = (134, 198)

# 右: 業者情報(住所・社名・電話は 123mm から右端まで)
VENDOR_LABELS = [(112, 46, "住　所"), (112, 55, "社　名"), (112, 64, "電　話")]
CODE_BOX = (140, 76, 198, 84)  # 業者コード枠 (x0, y0, x1, y1)
CODE_LABEL_X1 = 157
STAFF_LABEL_Y = 88
STAFF_BOXES = (153, 90, 198, 105)  # 業者担当者印 3マス(15mm角)

# 明細表(1ページ目)
TABLE_COLS = [  # (見出し, 左端, 右端)
    ("品名および仕様", 12, 96),
    ("数量", 96, 109),
    ("単位", 109, 119),
    ("単　価", 119, 143),
    ("金　　額", 143, 176),  # 33mm: ¥1,234,567,890 まで縮小なし
    ("備　考", 176, 198),
]
TABLE = {"left": 12, "right": 198, "top": 114, "header_h": 8, "row_h": 6.2, "rows": 16}  # 入力15行 + 合計(小計)1行
TABLE["bottom"] = TABLE["top"] + TABLE["header_h"] + TABLE["row_h"] * TABLE["rows"]

NOTES_BOX = (12, 225, 198, 253)  # 注記欄(5行)
CONFIRM_BOXES = {"left": 12, "top": 257, "w": 23, "h": 23, "count": 4}  # 社内確認用の押印枠(23mm角)

# 内訳ページ(「ページ追加」で増える2ページ目以降): タイトル・工事名・業者名と明細表だけ
CONT_SUFFIX = (133, 17, "（内　訳）")  # タイトル「御 見 積 書」の右
CONT_HEADER_Y = 29                      # 工事名・業者名の行(文字の中心)
CONT_PROJECT = {"label_x": 13, "colon_x": 25, "line_x": (12, 108)}
CONT_VENDOR = {"label_x": 112, "colon_x": 124, "line_x": (112, 198)}
CONT_TABLE = {"left": 12, "right": 198, "top": 36, "header_h": 8, "row_h": 6.2, "rows": 38}  # 入力37行 + 合計(小計)1行
CONT_TABLE["bottom"] = CONT_TABLE["top"] + CONT_TABLE["header_h"] + CONT_TABLE["row_h"] * CONT_TABLE["rows"]


class Sheet:
    """1枚の帳票画像に mm 単位で描く"""

    def __init__(self, color_name):
        self.src = Image.open(ASSETS / f"{color_name}_bg.png").convert("RGB")
        self.ink = (17, 97, 122) if color_name == "blue" else (255, 65, 65)
        self.page = Image.new("RGB", (W, H), "white")
        self.d = ImageDraw.Draw(self.page)

    def text(self, x, y, s, size=3.6, anchor="lm"):
        self.d.text((px(x), px(y)), s, font=ImageFont.truetype(FONT, px(size)), fill=self.ink, anchor=anchor)

    def hline(self, x0, x1, y, width=1):
        self.d.line([(px(x0), px(y)), (px(x1), px(y))], fill=self.ink, width=width)

    def vline(self, x, y0, y1, width=1):
        self.d.line([(px(x), px(y0)), (px(x), px(y1))], fill=self.ink, width=width)

    def rect(self, x0, y0, x1, y1, width=1):
        self.d.rectangle([px(x0), px(y0), px(x1), px(y1)], outline=self.ink, width=width)

    def title(self):
        """タイトル「御 見 積 書」を組んで左右中央(上端 TITLE_TOP)に置く"""
        parts = []
        for box, scale in TITLE_GLYPHS:
            g = self.src.crop(box)
            parts.append(g.resize((round(g.width * scale * TITLE_SCALE), round(g.height * scale * TITLE_SCALE)), Image.LANCZOS))
        pitch = TITLE_PITCH * TITLE_SCALE
        cell = max(g.width for g in parts)
        height = max(g.height for g in parts)
        width = round(pitch * (len(parts) - 1) + cell)
        left = (W - width) // 2
        for i, g in enumerate(parts):
            cx = left + cell / 2 + pitch * i
            self.page.paste(g, (round(cx - g.width / 2), px(TITLE_TOP) + (height - g.height) // 2))

    def crop(self, name):
        box, pos, scale = CROPS[name]
        part = self.src.crop(box)
        part = part.resize((round(part.width * scale), round(part.height * scale)), Image.LANCZOS)
        if pos is None:  # タイトルは左右中央
            self.page.paste(part, ((W - part.width) // 2, px(TITLE_TOP)))
        else:
            self.page.paste(part, (px(pos[0]), px(pos[1])))

    def table(self, t):
        """明細表(見出し + 行。最終行は合計/小計行で、その上は太線)"""
        top, hh, rh, rows = t["top"], t["header_h"], t["row_h"], t["rows"]
        body_top = top + hh
        for i in range(rows):
            self.hline(t["left"], t["right"], body_top + rh * i, width=3 if i == rows - 1 else 1)
        for _, cx0, _ in TABLE_COLS[1:]:
            self.vline(cx0, top, t["bottom"])
        for label, cx0, cx1 in TABLE_COLS:
            self.text((cx0 + cx1) / 2, top + hh / 2, label, anchor="mm")
        self.d.rectangle([px(t["left"]) - 2, px(top) - 2, px(t["right"]) + 1, px(t["bottom"]) + 1], outline=self.ink, width=4)

    def save(self, out):
        # 綴じ代の分だけ全体を右へずらして保存
        shifted = Image.new("RGB", (W, H), "white")
        shifted.paste(self.page.crop((0, 0, W - px(BINDING_MM), H)), (px(BINDING_MM), 0))
        shifted.save(out, dpi=(DPI, DPI), optimize=True)
        print("saved", out)


def build_main(color_name):
    s = Sheet(color_name)
    s.title()
    for name in CROPS:
        s.crop(name)

    # 見積総額(税抜)
    s.text(*TOTAL["label"], "見積総額(税抜)", size=4.2)
    s.text(*TOTAL["yen"], "円", size=4.6)
    s.hline(*TOTAL["line_x"], TOTAL["line_y"], width=3)
    s.text(WELFARE["left"], WELFARE["y"], "(法定福利費相当額", size=3.3)
    s.text(WELFARE["right_text_x"], WELFARE["y"], "円を含む。)", size=3.3)

    # 工事情報
    for line_y, label in PROJECT_ROWS:
        s.text(PROJECT_LABEL_X, line_y - 2.6, label)
        s.text(PROJECT_LABEL_X + 25, line_y - 2.6, "：")
        s.hline(*PROJECT_X, line_y)
    for x, ch in PERIOD_MARKS:
        s.text(x, PROJECT_ROWS[4][0] - 2.6, ch)
    for x, ch in VALID_MARKS:
        s.text(x, PROJECT_ROWS[5][0] - 2.6, ch)

    # 業者見積日・番号
    s.text(*QUOTE_DATE["label"], "業者見積日", size=3.0)
    for x, ch in QUOTE_DATE["marks"]:
        s.text(x, QUOTE_DATE["label"][1], ch)
    s.hline(*QUOTE_LINE_X, QUOTE_DATE["label"][1] + 2.6)
    s.text(*QUOTE_NO["label"], "業者見積番号", size=3.0)
    s.text(QUOTE_NO["dai"], QUOTE_NO["label"][1], "第")
    s.text(QUOTE_NO["go"], QUOTE_NO["label"][1], "号")
    s.hline(*QUOTE_LINE_X, QUOTE_NO["label"][1] + 2.6)

    # 業者情報
    for x, y, label in VENDOR_LABELS:
        s.text(x, y, label, size=3.0)
    x0, y0, x1, y1 = CODE_BOX
    s.rect(x0, y0, x1, y1)
    s.vline(CODE_LABEL_X1, y0, y1)
    s.text((x0 + CODE_LABEL_X1) / 2, (y0 + y1) / 2, "業者コード", size=2.8, anchor="mm")
    sx0, sy0, sx1, sy1 = STAFF_BOXES
    s.text((sx0 + sx1) / 2, STAFF_LABEL_Y, "業 者 担 当 者 印", size=2.6, anchor="mm")
    s.rect(sx0, sy0, sx1, sy1)
    step = (sx1 - sx0) / 3
    for i in (1, 2):
        s.vline(sx0 + step * i, sy0, sy1)

    s.table(TABLE)

    # 注記欄
    nx0, ny0, nx1, ny1 = NOTES_BOX
    s.d.rectangle([px(nx0) - 1, px(ny0) - 1, px(nx1), px(ny1)], outline=s.ink, width=3)
    s.text(nx0 + 2, ny0 + 3, "注　記")

    # 社内確認用の押印枠(4つ横並び)
    c = CONFIRM_BOXES
    for i in range(c["count"]):
        bx = c["left"] + c["w"] * i
        s.rect(bx, c["top"], bx + c["w"], c["top"] + c["h"])

    s.save(ASSETS / f"{color_name}_bg_portrait.png")


def build_cont(color_name):
    s = Sheet(color_name)
    s.title()
    s.text(CONT_SUFFIX[0], CONT_SUFFIX[1], CONT_SUFFIX[2], size=4.6)
    for spec, label in ((CONT_PROJECT, "工事名"), (CONT_VENDOR, "業者名")):
        s.text(spec["label_x"], CONT_HEADER_Y, label)
        s.text(spec["colon_x"], CONT_HEADER_Y, "：")
        s.hline(*spec["line_x"], CONT_HEADER_Y + 2.6)
    s.table(CONT_TABLE)
    s.save(ASSETS / f"{color_name}_bg_portrait_cont.png")


if __name__ == "__main__":
    for c in ("blue", "red"):
        build_main(c)
        build_cont(c)
    print("table bottom(mm):", round(TABLE["bottom"], 2), "/ cont table bottom(mm):", round(CONT_TABLE["bottom"], 2))
