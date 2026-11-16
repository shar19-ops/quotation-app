"""A4縦の見積書帳票(背景画像)を作る。

使い方:  python templates/portrait/build_portrait_template.py
出力:    assets/blue_bg_portrait.png, assets/red_bg_portrait.png (200dpi, 1654x2339px)

- 配置は「見積書レイアウト参考.pdf」(雄電社の御見積書)に合わせている:
  上段左に宛名・見積総額(下線+大きな数字)・工事情報(下線の行)、上段右に業者見積日/番号・業者情報・
  業者コード・業者担当者印、下段に明細表(15行+合計)・注記欄(5行)・社内確認用の押印枠4つ(正方形)。
- タイトル「見 積 書」、社名ロゴ「株式会社 雄電社 御中」、「下記の通りお見積り申し上げます。」は
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


def px(mm):
    return round(mm * DPI / 25.4)


# 横帳票から切り出す部品: (切り出し範囲 [横帳票 px@200dpi], 配置先 左上 (mm), 縮尺)
CROPS = {
    "title":   ((963, 142, 1295, 203), None, 0.9),   # 見 積 書 (左右中央・上端 14mm)
    "logo":    ((247, 223, 921, 292), (12, 25), 0.8),  # 株式会社 雄電社 御中
    "message": ((249, 303, 768, 339), (13, 34.5), 0.75),  # 下記の通りお見積り申し上げます。
}
TITLE_TOP = 13

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

# 明細表
TABLE = {
    "left": 12, "right": 198, "top": 114, "header_h": 8, "row_h": 6.2, "rows": 16,  # 入力15行 + 合計1行
    "cols": [  # (見出し, 左端, 右端)
        ("品名および仕様", 12, 96),
        ("数量", 96, 109),
        ("単位", 109, 119),
        ("単　価", 119, 143),
        ("金　　額", 143, 176),  # 33mm: ¥1,234,567,890 まで縮小なし
        ("備　考", 176, 198),
    ],
}
TABLE["bottom"] = TABLE["top"] + TABLE["header_h"] + TABLE["row_h"] * TABLE["rows"]

NOTES_BOX = (12, 225, 198, 253)  # 注記欄(5行)
CONFIRM_BOXES = {"left": 12, "top": 257, "w": 23, "h": 23, "count": 4}  # 社内確認用の押印枠(23mm角)


def build(color_name):
    src = Image.open(ASSETS / f"{color_name}_bg.png").convert("RGB")
    ink = (17, 97, 122) if color_name == "blue" else (255, 65, 65)
    page = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(page)

    def font(size_mm):
        return ImageFont.truetype(FONT, px(size_mm))

    def text(x, y, s, size=3.6, anchor="lm", spacing=0):
        f = font(size)
        if not spacing:
            d.text((px(x), px(y)), s, font=f, fill=ink, anchor=anchor)
            return
        # 字間をあけて描く(左端基準)
        cx = px(x)
        for ch in s:
            d.text((cx, px(y)), ch, font=f, fill=ink, anchor="lm")
            cx += d.textlength(ch, font=f) + px(spacing)

    def hline(x0, x1, y, width=1):
        d.line([(px(x0), px(y)), (px(x1), px(y))], fill=ink, width=width)

    def vline(x, y0, y1, width=1):
        d.line([(px(x), px(y0)), (px(x), px(y1))], fill=ink, width=width)

    def rect(x0, y0, x1, y1, width=1):
        d.rectangle([px(x0), px(y0), px(x1), px(y1)], outline=ink, width=width)

    # 切り出し部品
    for name, (box, pos, scale) in CROPS.items():
        part = src.crop(box)
        part = part.resize((round(part.width * scale), round(part.height * scale)), Image.LANCZOS)
        if pos is None:  # タイトルは左右中央
            page.paste(part, ((W - part.width) // 2, px(TITLE_TOP)))
        else:
            page.paste(part, (px(pos[0]), px(pos[1])))

    # 見積総額(税抜)
    text(*TOTAL["label"], "見積総額(税抜)", size=4.2)
    text(*TOTAL["yen"], "円", size=4.6)
    hline(*TOTAL["line_x"], TOTAL["line_y"], width=3)
    text(WELFARE["left"], WELFARE["y"], "(法定福利費相当額", size=3.3)
    text(WELFARE["right_text_x"], WELFARE["y"], "円を含む。)", size=3.3)

    # 工事情報
    for line_y, label in PROJECT_ROWS:
        text(PROJECT_LABEL_X, line_y - 2.6, label, size=3.6)
        text(PROJECT_LABEL_X + 25, line_y - 2.6, "：", size=3.6)
        hline(*PROJECT_X, line_y)
    period_y = PROJECT_ROWS[4][0] - 2.6
    for x, s in PERIOD_MARKS:
        text(x, period_y, s, size=3.6)
    valid_y = PROJECT_ROWS[5][0] - 2.6
    for x, s in VALID_MARKS:
        text(x, valid_y, s, size=3.6)

    # 業者見積日・番号
    text(*QUOTE_DATE["label"], "業者見積日", size=3.0)
    for x, s in QUOTE_DATE["marks"]:
        text(x, QUOTE_DATE["label"][1], s, size=3.6)
    hline(*QUOTE_LINE_X, QUOTE_DATE["label"][1] + 2.6)
    text(*QUOTE_NO["label"], "業者見積番号", size=3.0)
    text(QUOTE_NO["dai"], QUOTE_NO["label"][1], "第", size=3.6)
    text(QUOTE_NO["go"], QUOTE_NO["label"][1], "号", size=3.6)
    hline(*QUOTE_LINE_X, QUOTE_NO["label"][1] + 2.6)

    # 業者情報
    for x, y, s in VENDOR_LABELS:
        text(x, y, s, size=3.0)
    x0, y0, x1, y1 = CODE_BOX
    rect(x0, y0, x1, y1)
    vline(CODE_LABEL_X1, y0, y1)
    text((x0 + CODE_LABEL_X1) / 2, (y0 + y1) / 2, "業者コード", size=2.8, anchor="mm")
    sx0, sy0, sx1, sy1 = STAFF_BOXES
    text((sx0 + sx1) / 2, STAFF_LABEL_Y, "業 者 担 当 者 印", size=2.6, anchor="mm")
    rect(sx0, sy0, sx1, sy1)
    step = (sx1 - sx0) / 3
    for i in (1, 2):
        vline(sx0 + step * i, sy0, sy1)

    # 明細表
    t = TABLE
    top, hh, rh, rows = t["top"], t["header_h"], t["row_h"], t["rows"]
    body_top = top + hh
    for i in range(rows):
        y = body_top + rh * i
        hline(t["left"], t["right"], y, width=3 if i == rows - 1 else 1)  # 合計行の上は太線
    for _, cx0, _ in t["cols"][1:]:
        vline(cx0, top, t["bottom"])
    for label, cx0, cx1 in t["cols"]:
        text((cx0 + cx1) / 2, top + hh / 2, label, size=3.6, anchor="mm")
    d.rectangle([px(t["left"]) - 2, px(top) - 2, px(t["right"]) + 1, px(t["bottom"]) + 1], outline=ink, width=4)

    # 注記欄
    nx0, ny0, nx1, ny1 = NOTES_BOX
    d.rectangle([px(nx0) - 1, px(ny0) - 1, px(nx1), px(ny1)], outline=ink, width=3)
    text(nx0 + 2, ny0 + 3, "注　記", size=3.6)

    # 社内確認用の押印枠(4つ横並び)
    c = CONFIRM_BOXES
    for i in range(c["count"]):
        bx = c["left"] + c["w"] * i
        rect(bx, c["top"], bx + c["w"], c["top"] + c["h"])

    out = ASSETS / f"{color_name}_bg_portrait.png"
    page.save(out, dpi=(DPI, DPI), optimize=True)
    print("saved", out)


if __name__ == "__main__":
    for c in ("blue", "red"):
        build(c)
    print("table bottom(mm):", round(TABLE["bottom"], 2))
