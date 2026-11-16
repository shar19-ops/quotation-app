"""A4縦の見積書帳票(背景画像)を、A4横の帳票画像から部品を切り出して組み立てる。

使い方:  python templates/portrait/build_portrait_template.py
出力:    assets/blue_bg_portrait.png, assets/red_bg_portrait.png (200dpi, 1654x2339px)

- 文字・枠などの部品は横の帳票(assets/{blue,red}_bg.png, 200dpi)からそのまま切り出して配置する
  (書体・色・線の太さを原本と完全に一致させるため)。
- 明細表だけは縦の幅に合わせて列を組み直して描画する(見出し文字は原本から1文字ずつ切り出して再配置)。
- 部品を動かしたら script.js / script-employee.js の LAYOUTS.portrait の座標も同じだけずらすこと。
  座標の対応はこのファイルの PLACE / TABLE の値から計算している(px@200dpi × 0.75 = px@150dpi)。
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"

W, H = 1654, 2339  # A4縦 200dpi

# 横帳票から切り出す部品: 名前 -> (切り出し範囲 x0,y0,x1,y1 [横帳票 px@200dpi], 配置先 x,y [縦帳票 px@200dpi], 縮尺)
PLACE = {
    "title":   ((963, 142, 1295, 203),   (661, 96),    1.0),   # 見 積 書
    "logo":    ((247, 223, 921, 292),    (197, 186),   1.0),   # 株式会社 雄電社 御中
    "message": ((249, 303, 768, 339),    (199, 266),   1.0),   # 下記の通りお見積り申し上げます。
    "quoteDate": ((1757, 223, 2205, 260), (1111, 186), 1.0),   # 業者見積日 年 月 日
    "quoteNo": ((1757, 310, 2209, 347),  (1111, 273),  1.0),   # 業者見積番号 第 号
    "project": ((140, 361, 1213, 639),   (90, 326),    1.0),   # 本支店区分〜見積有効期限
    "vendor":  ((1512, 363, 1594, 563),  (90, 626),    1.0),   # 住所 / 社名 / 電話
    "code":    ((1653, 596, 2214, 674),  (1002, 626),  1.0),   # 業者コード枠
    "staff":   ((1848, 674, 2214, 805),  (1197, 704),  1.0),   # 業者担当者印 枠
    "total":   ((140, 645, 1076, 783),   (90, 846),    1.0),   # 見積総額(税抜) 桁枠
    "welfare": ((1135, 737, 1787, 785),  (1040, 895),  0.8),   # 法定福利費( 円)を含む。
    "bottom":  ((140, 1441, 873, 1608),  (90, 2106),   1.0),   # 下部の押印枠4つ
    "next":    ((1069, 1460, 1495, 1495), (846, 2108), 1.0),   # -次葉に続く- 註記
}

# 明細表 (縦帳票 px@200dpi)
PITCH = 35.227  # 単価・金額の1桁の幅(横帳票と同じ)
TABLE = {
    "left": 94, "right": 1559,
    "top": 1000, "header_h": 55, "row_h": 49.5, "rows": 21,  # 入力20行 + 合計1行
    "name": (94, 494), "qty": (494, 606), "unit": (606, 686),
    "price_left": 686, "price_int": 7, "price_sen": 2,
    "amount_digits": 10,
}
TABLE["price_right"] = TABLE["price_left"] + PITCH * (TABLE["price_int"] + TABLE["price_sen"])
TABLE["amount_left"] = TABLE["price_right"]
TABLE["amount_right"] = TABLE["amount_left"] + PITCH * TABLE["amount_digits"]
TABLE["bottom"] = TABLE["top"] + TABLE["header_h"] + TABLE["row_h"] * TABLE["rows"]

# 見出し文字: 横帳票の切り出し範囲(1文字ずつ) と 縦帳票の列
HEADERS = [
    # (列 x0, x1, [(切り出し x0, x1), ...]) 見出し行 y 838〜868 を切り出す
    ((94, 494), [(260, 285), (348, 373), (440, 528), (589, 618), (679, 708)]),   # 品 名 および 仕 様
    ((494, 606), [(875, 904), (967, 995)]),                                       # 数 量
    ((606, 686), [(1070, 1128)]),                                                  # 単位
    (None, [(1253, 1281), (1402, 1431)]),                                          # 単 価 (位置は下で指定)
    (None, [(1655, 1684), (1776, 1805)]),                                          # 金 額
    (None, [(1990, 2019), (2112, 2140)]),                                          # 備 考
]
HEADER_SRC_Y = (836, 869)
SEN_SRC = (1491, 848, 1529, 879)  # (銭)


def build(color_name):
    src = Image.open(ASSETS / f"{color_name}_bg.png").convert("RGB")
    ink = (17, 97, 122) if color_name == "blue" else (255, 65, 65)
    shade = (192, 213, 220) if color_name == "blue" else (255, 229, 229)

    page = Image.new("RGB", (W, H), "white")
    for name, (box, (x, y), scale) in PLACE.items():
        part = src.crop(box)
        if scale != 1.0:
            part = part.resize((round(part.width * scale), round(part.height * scale)), Image.LANCZOS)
        page.paste(part, (x, y))

    d = ImageDraw.Draw(page)
    t = TABLE
    top, hh, rh, rows = t["top"], t["header_h"], t["row_h"], t["rows"]
    body_top = top + hh
    bottom = round(t["bottom"])

    # 銭の網掛け(明細行のみ)
    sen_left = t["price_left"] + PITCH * t["price_int"]
    d.rectangle([round(sen_left) + 1, body_top + 1, round(t["price_right"]) - 1, bottom - 1], fill=shade)

    def vline(x, y0, y1, dotted=False):
        x = round(x)
        if not dotted:
            d.line([(x, y0), (x, y1)], fill=ink, width=1)
            return
        y = y0
        while y < y1:
            d.line([(x, y), (x, min(y + 3, y1))], fill=ink, width=1)
            y += 6

    # 横罫(見出し下・各行)
    for i in range(rows):
        y = round(body_top + rh * i)
        d.line([(t["left"], y), (t["right"], y)], fill=ink, width=1)

    # 縦罫
    for x in (t["qty"][0], t["unit"][0], t["price_left"], t["amount_left"], t["amount_right"]):
        vline(x, top, bottom)
    # 単価: 整数部は右(銭の手前)から3桁ごとに実線、銭の境も実線、それ以外は点線(見出し行には引かない)
    for i in range(1, t["price_int"] + t["price_sen"]):
        x = t["price_left"] + PITCH * i
        from_right_int = t["price_int"] - i  # 銭の境から左へ何桁目か
        solid = i == t["price_int"] or (0 < from_right_int and from_right_int % 3 == 0)
        vline(x, body_top, bottom, dotted=not solid)
    for i in range(1, t["amount_digits"]):
        x = t["amount_left"] + PITCH * i
        from_right = t["amount_digits"] - i
        vline(x, body_top, bottom, dotted=from_right % 3 != 0)

    # 外枠(太線4px)
    d.rectangle([t["left"] - 2, top - 2, t["right"] + 1, bottom + 1], outline=ink, width=4)

    # 見出し文字
    def paste_glyphs(col, glyph_boxes, center=None, gap=None):
        parts = [src.crop((gx0, HEADER_SRC_Y[0], gx1, HEADER_SRC_Y[1])) for gx0, gx1 in glyph_boxes]
        total = sum(p.width for p in parts)
        x0, x1 = col
        if gap is None:
            # 列幅の両端に余白を残して均等割り
            margin = (x1 - x0) * 0.12 if len(parts) > 1 else 0
            gap = (x1 - x0 - 2 * margin - total) / (len(parts) - 1) if len(parts) > 1 else 0
            start = x0 + margin if len(parts) > 1 else (x0 + x1 - total) / 2
        else:
            width = total + gap * (len(parts) - 1)
            start = (center if center is not None else (x0 + x1) / 2) - width / 2
        y = top + (hh - (HEADER_SRC_Y[1] - HEADER_SRC_Y[0])) // 2 + 1
        x = start
        for p in parts:
            page.paste(p, (round(x), y))
            x += p.width + gap

    paste_glyphs(HEADERS[0][0], HEADERS[0][1])
    paste_glyphs(HEADERS[1][0], HEADERS[1][1], gap=30)
    paste_glyphs(HEADERS[2][0], HEADERS[2][1])
    paste_glyphs((t["price_left"], sen_left), HEADERS[3][1], gap=70)
    paste_glyphs((t["amount_left"], t["amount_right"]), HEADERS[4][1], gap=90)
    paste_glyphs((t["amount_right"], t["right"]), HEADERS[5][1], gap=40)
    sen = src.crop(SEN_SRC)
    page.paste(sen, (round(t["price_right"]) - sen.width - 1, top + hh - sen.height - 1))

    out = ASSETS / f"{color_name}_bg_portrait.png"
    page.save(out, dpi=(200, 200), optimize=True)
    print("saved", out)


if __name__ == "__main__":
    for c in ("blue", "red"):
        build(c)
    print({k: round(v, 3) if isinstance(v, float) else v for k, v in TABLE.items()})
