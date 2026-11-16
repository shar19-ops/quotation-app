"""A4縦の見積書帳票(背景画像)を、A4横の帳票画像から部品を切り出して組み立てる。

使い方:  python templates/portrait/build_portrait_template.py
出力:    assets/blue_bg_portrait.png, assets/red_bg_portrait.png (200dpi, 1654x2339px)

- 文字・枠などの部品は横の帳票(assets/{blue,red}_bg.png, 200dpi)からそのまま切り出して配置する
  (書体・色・線の太さを原本と完全に一致させるため)。
- 明細表だけは縦の幅に合わせて列を組み直して描画する(見出し文字は原本から1文字ずつ切り出して再配置)。
  単価・金額は桁の縦線・銭の欄を設けない(アプリ側でカンマ付き右寄せで印字)。
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
# 単価・金額は桁の縦線・銭の欄を設けず(カンマ付き右寄せで印字)、その分「品名および仕様」を広く取る
TABLE = {
    "left": 94, "right": 1559,
    "top": 1000, "header_h": 55, "row_h": 49.5, "rows": 21,  # 入力20行 + 合計1行
    "name": (94, 796),       # 89mm
    "qty": (796, 898),       # 13mm
    "unit": (898, 977),      # 10mm
    "price": (977, 1166),    # 24mm (〜9,999,999)
    "amount": (1166, 1386),  # 28mm (〜999,999,999)
    "remarks": (1386, 1559), # 22mm
}
TABLE["bottom"] = TABLE["top"] + TABLE["header_h"] + TABLE["row_h"] * TABLE["rows"]

# 見出し文字: 横帳票の見出し行(y 836〜869)から1文字(語)ずつ切り出して、各列の中央に指定の間隔で並べる
HEADERS = [
    # (列, [(切り出し x0, x1), ...], 文字の間隔px)
    ("name",    [(260, 285), (348, 373), (440, 528), (589, 618), (679, 708)], 55),  # 品 名 および 仕 様
    ("qty",     [(875, 904), (967, 995)], 18),                                      # 数 量
    ("unit",    [(1070, 1128)], 0),                                                 # 単位
    ("price",   [(1253, 1281), (1402, 1431)], 50),                                  # 単 価
    ("amount",  [(1655, 1684), (1776, 1805)], 60),                                  # 金 額
    ("remarks", [(1990, 2019), (2112, 2140)], 40),                                  # 備 考
]
HEADER_SRC_Y = (836, 869)


def build(color_name):
    src = Image.open(ASSETS / f"{color_name}_bg.png").convert("RGB")
    ink = (17, 97, 122) if color_name == "blue" else (255, 65, 65)

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

    # 横罫(見出し下・各行)
    for i in range(rows):
        y = round(body_top + rh * i)
        d.line([(t["left"], y), (t["right"], y)], fill=ink, width=1)

    # 縦罫(列の境のみ)
    for key in ("qty", "unit", "price", "amount", "remarks"):
        x = t[key][0]
        d.line([(x, top), (x, bottom)], fill=ink, width=1)

    # 外枠(太線4px)
    d.rectangle([t["left"] - 2, top - 2, t["right"] + 1, bottom + 1], outline=ink, width=4)

    # 見出し文字(列の中央に指定の間隔で並べる)
    y = top + (hh - (HEADER_SRC_Y[1] - HEADER_SRC_Y[0])) // 2 + 1
    for key, glyph_boxes, gap in HEADERS:
        parts = [src.crop((gx0, HEADER_SRC_Y[0], gx1, HEADER_SRC_Y[1])) for gx0, gx1 in glyph_boxes]
        x0, x1 = t[key]
        width = sum(p.width for p in parts) + gap * (len(parts) - 1)
        x = (x0 + x1) / 2 - width / 2
        for p in parts:
            page.paste(p, (round(x), y))
            x += p.width + gap

    out = ASSETS / f"{color_name}_bg_portrait.png"
    page.save(out, dpi=(200, 200), optimize=True)
    print("saved", out)


if __name__ == "__main__":
    for c in ("blue", "red"):
        build(c)
    print({k: round(v, 3) if isinstance(v, float) else v for k, v in TABLE.items()})
