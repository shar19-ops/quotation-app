const STORAGE_KEY = "quotationApp.draft.yudensha";

// 背景画像src: HTMLのimg要素から読む(開発版=ファイルパス, 配布版=base64 dataURL のどちらでも動作)
const BG_BLUE_SRC = () => document.getElementById("bgBlueSrc").src;
const BG_RED_SRC  = () => document.getElementById("bgRedSrc").src;

const fieldIds = [
  "branchType", "projectNo", "projectName", "siteLocation", "periodStart", "periodEnd", "validDays",
  "vendorQuoteDate", "vendorQuoteNo", "vendorAddress", "vendorName", "vendorTel", "vendorCode",
  "welfareCost", "notes", "themeColor",
  "stampX",  "stampY",  "stampSize",
  "stampX2", "stampY2", "stampSize2",
  "stampX3", "stampY3", "stampSize3",
  "stampX4", "stampY4", "stampSize4"
];


let stampDataUrl  = null;
let stampDataUrl2 = null;
let stampDataUrl3 = null;
let stampDataUrl4 = null; // 社判

let attachments = []; // [{name, type, dataUrl}]
let a0004 = null; // 取り込んだ見積依頼書(本-購買-A0004)。自社1社分だけ(a0004.js の extract)

// 元PDF(150dpiレンダリング基準, px)→mm変換。原寸ページは 1754x1240px = 297x210mm
const PX2MM = 25.4 / 150;
const mm = (px) => px * PX2MM;

// 各項目を書き込む座標(px, 150dpi基準)。実際に印刷したPDFを元PDFとピクセル比較して校正済み。
const COORDS = {
  vendorQuoteDate_y: { x: 1434, y: 170 },
  vendorQuoteDate_m: { x: 1547, y: 170 },
  vendorQuoteDate_d: { x: 1608, y: 170 },
  vendorQuoteNo:     { x: 1470, y: 231 },
  vendorQuoteNoCenter: 1545,

  branchCode:   { x: 356, y: 270 },
  branchName:   { x: 490, y: 270 },
  projectNo:    { x: 332, y: 301 },
  projectNoCenter: 382, // 「工事名(  )」の括弧内(304〜459px)の中心
  projectNoWidth: 150,  // 12桁英数字が収まる幅。超える場合は横方向に縮小する
  projectName:  { x: 490, y: 301 },
  siteLocation: { x: 317, y: 350 },

  period_y1: { x: 345, y: 398 },
  period_m1: { x: 475, y: 398 },
  period_d1: { x: 540, y: 398 },
  period_y2: { x: 665, y: 398 },
  period_m2: { x: 788, y: 398 },
  period_d2: { x: 854, y: 398 },

  validDays: { x: 500, y: 449 },

  vendorAddress: { x: 1210, y: 277 },
  vendorName:    { x: 1210, y: 335 },
  vendorTel:     { x: 1210, y: 395 },
  vendorCode:    { x: 1405, y: 470 },
  vendorCodeCenter: 1523,
  vendorCodeWidth: 250,

  welfareCost: { x: 1042, y: 560 },

  notes: { x: 1140, y: 1090 }
};

const DIGIT_GRID = { x0: 303.6, colWidth: 44.2, y: 545 };

const ITEMS_LAYOUT = {
  rowTop: 660,
  rowHeight: 41.2,
  textOffset: 9,
  totalRowY: 1039,
  cols: {
    name: 130,
    qtyRight: 773,
    qtyWidth: 148,
    unitCenter: 822,
    unitWidth: 65,
    priceRight: 1102.625,
    priceWidth: 240,
    amountRight: 1445.625,
    amountWidth: 290,
    remarks: 1450
  }
};

// ===== 帳票の向き(A4縦=標準 / A4横=旧様式) =====
// A4縦の帳票(assets/*_bg_portrait.png)は templates/portrait/build_portrait_template.py で生成している
// (配置は「見積書レイアウト参考.pdf」に合わせた)。縦の印字位置は同スクリプトと同じ mm の値で定義する。
const DEFAULT_ORIENTATION = "portrait"; // 2026-11 承認によりA4縦を標準とする(A4横は旧様式として切替可能)

// mm → 150dpi基準px
const P = (mmValue) => mmValue / PX2MM;
// 中心 y(mm) に文字(既定4.11mm)の中心を合わせたときの、文字の上端(px)
const textTopAt = (centerMm, fontMm = 4.11) => P(centerMm - fontMm / 2);

const PORTRAIT_COORDS = {
  // 業者見積日: 「年」「月」「日」の手前に右寄せ / 業者見積番号: 「第」と「号」の間の中央
  quoteDateY: textTopAt(27.5),
  quoteDateRights: [P(160), P(172), P(184)],
  quoteNoY: textTopAt(35), quoteNoCenter: P(166), quoteNoWidth: P(50),

  // 見積総額(税抜): 大きな数字(7mm)を「円」の手前に右寄せ / 法定福利費相当額: 「円を含む。)」の手前に右寄せ
  totalRight: P(101), totalWidth: P(55), totalY: textTopAt(48.5, 7),
  welfareRight: P(78), welfareY: textTopAt(57.5),

  // 工事情報(下線の行。幅は見積総額と同じ): 値は「：」の後ろ(42mm)から下線の右端(108mm)まで
  valueX: P(42), valueWidth: P(108 - 42 - 1),
  branchY: textTopAt(66.4), branchNameX: P(52),
  projectNoY: textTopAt(74.4),
  projectNameY: textTopAt(82.4),
  siteLocationY: textTopAt(90.4),
  periodY: textTopAt(98.4),
  periodRights: [P(51), P(59.5), P(68), P(86.5), P(95), P(103.5)], // 年・月・日 ～ 年・月・日 の手前
  validDaysY: textTopAt(106.4), validDaysRight: P(71),

  // 業者情報(住所・社名・電話は 123mm から右端まで。長い場合は横方向に縮小)
  vendorX: P(123), vendorWidth: P(198 - 123 - 1),
  vendorAddressY: textTopAt(46), vendorNameY: textTopAt(55), vendorTelY: textTopAt(64),
  vendorCodeCenter: P((157 + 198) / 2), vendorCodeWidth: P(38), vendorCodeY: textTopAt(80),

  // 複数ページのとき: ページ番号(右上)、「－次葉に続く－」(押印枠の右)
  pageNoRight: P(198), pageNoY: textTopAt(17),
  nextPage: { center: P(151), y: textTopAt(268.5) },

  // 注記(最大5行)
  notes: { x: P(15), y: P(231) }
};

// 明細表(縦): build_portrait_template.py の TABLE と対応(mm)。入力15行 + 合計。
// 列幅: 品名84・数量13・単位10・単価24・金額33・備考22(mm)
// 単価・金額は桁の縦線・銭の欄が無いので、カンマ付きで右寄せ(字間なし)に印字する。
const PORTRAIT_ITEMS_LAYOUT = (() => {
  const rowH = 6.2;
  const pad = 1.6; // 罫線から数字までの余白(mm)
  return {
    rowTop: P(114 + 8),
    rowHeight: P(rowH),
    textOffset: P((rowH - 4.11) / 2 + 0.05),
    plainNumbers: true,
    totalLabelCenter: P((12 + 96) / 2),
    cols: {
      name: P(13.6),
      nameWidth: P(96 - 13.6 - 1.2),    // 品名の印字幅。超える場合は横方向に縮小
      qtyRight: P(109 - pad),
      qtyWidth: P(13 - pad * 2),
      unitCenter: P(114),
      unitWidth: P(10),
      priceRight: P(143 - pad),
      priceWidth: P(24 - pad * 2),      // 〜9,999,999。超える場合は横方向に縮小
      amountRight: P(176 - pad),
      amountWidth: P(33 - pad * 2),     // ¥1,234,567,890(10億円台)まで縮小なし
      remarks: P(177.4),
      remarksWidth: P(198 - 177.4 - 1)  // 備考の印字幅。超える場合は横方向に縮小
    }
  };
})();

// 内訳ページ(「ページ追加」で増える縦の2ページ目以降): build_portrait_template.py の CONT_* と対応(mm)
const CONT_ROWS = 37; // 内訳ページ1枚の明細行数(最終行の小計/合計を除く)
const PORTRAIT_CONT = {
  headerY: textTopAt(29),
  projectX: P(28), projectWidth: P(108 - 28 - 1),
  vendorX: P(127), vendorWidth: P(198 - 127 - 1),
  pageNoRight: P(198), pageNoY: textTopAt(17),
  nextPage: { center: P(105), y: textTopAt(286) },
  items: { ...PORTRAIT_ITEMS_LAYOUT, rowTop: P(36 + 8) }
};

const LAYOUTS = {
  landscape: {
    pageW: 1754, pageH: 1240,
    coords: COORDS,
    digitGrid: DIGIT_GRID,
    items: ITEMS_LAYOUT,
    rows: 9,
    notesMaxLines: 4,
    bg: { blue: () => BG_BLUE_SRC(), red: () => BG_RED_SRC() },
    stampDefaults: {
      stampX4: 1480, stampY4: 300,
      stampX: 1586, stampY: 538,
      stampX2: 1497, stampY2: 538,
      stampX3: 1410, stampY3: 538
    }
  },
  portrait: {
    pageW: 1240, pageH: 1754,
    coords: PORTRAIT_COORDS,
    portraitHeader: true,
    items: PORTRAIT_ITEMS_LAYOUT,
    rows: 15,
    notesMaxLines: 5,
    bg: {
      blue: () => document.getElementById("bgBluePortraitSrc").src,
      red:  () => document.getElementById("bgRedPortraitSrc").src
    },
    contBg: {
      blue: () => document.getElementById("bgBluePortraitContSrc").src,
      red:  () => document.getElementById("bgRedPortraitContSrc").src
    },
    // 担当者印①②③は業者担当者印の3マス(右から①②③、中心 x 190.5/175.5/160.5mm・y 97.5mm、サイズ50px)、
    // 社判(サイズ110px)は社名の行の右端寄り(中心 186mm, 58mm。住所に掛からない位置)
    stampDefaults: {
      stampX4: Math.round(P(186) - 55), stampY4: Math.round(P(58) - 55),
      stampX: Math.round(P(190.5) - 25), stampY: Math.round(P(97.5) - 25),
      stampX2: Math.round(P(175.5) - 25), stampY2: Math.round(P(97.5) - 25),
      stampX3: Math.round(P(160.5) - 25), stampY3: Math.round(P(97.5) - 25)
    }
  }
};

let orientation = DEFAULT_ORIENTATION;
const layout = () => LAYOUTS[orientation];

// 押印位置は向きごとに別々に保持する(横で調整した位置を縦に持ち込まない)
const STAMP_POS_IDS = ["stampX", "stampY", "stampX2", "stampY2", "stampX3", "stampY3", "stampX4", "stampY4"];
let stampPos = {}; // { landscape: {stampX: .., ...}, portrait: {...} }

// 内訳ページ(縦のみ)の枚数。1ページ目の後ろに「ページ追加」で増やす
let extraPages = 0;
const pageCount = () => (orientation === "portrait" ? 1 + extraPages : 1);
const itemCapacity = () => (orientation === "portrait" ? layout().rows + extraPages * CONT_ROWS : layout().rows);
// 明細の行番号(0始まり)が何ページ目か(1始まり。縦のみ)
const pageOfItem = (idx) => (idx < layout().rows ? 1 : 2 + Math.floor((idx - layout().rows) / CONT_ROWS));

let items = [];

function emptyItem() {
  return { name: "", qty: "", unit: "", price: "", remarks: "" };
}

// 単価: 縦の帳票は銭の欄が無いので円単位(四捨五入)で扱う。金額・合計もこの単価で計算し、印字と一致させる
function unitPrice(item) {
  const price = Number(item.price) || 0;
  return layout().items.plainNumbers ? Math.round(price) : price;
}

function itemAmount(item) {
  return (Number(item.qty) || 0) * unitPrice(item);
}

function isEmptyItem(item) {
  return !item.name && !item.qty && !item.unit && !item.price && !item.remarks;
}

// 末尾の空行を今の向きの既定行数(横9行・縦20行)まで詰める(過去の10行時代のデータにも対応)
function trimTrailingEmptyRows(arr) {
  const result = arr.slice();
  while (result.length > itemCapacity() && isEmptyItem(result[result.length - 1])) {
    result.pop();
  }
  return result;
}

// マイナスの数値は「▲」で表記する(例: ▲50,000)。ユーザー指定
function minusMark(n, fmt) {
  return n < 0 ? "▲" + fmt(-n) : fmt(n);
}

function yen(n) {
  if (!n) return "0";
  return minusMark(Math.round(n), v => v.toLocaleString("ja-JP"));
}

// 「¥」付きの金額。マイナスは「▲¥50,000」
function yenMark(n) {
  return n < 0 ? "▲¥" + yen(-n) : "¥" + yen(n);
}

function priceFmt(n) {
  if (!n) return "";
  return minusMark(n, v => {
    const hasFraction = Math.round(v * 100) % 100 !== 0;
    return v.toLocaleString("ja-JP", { minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2, useGrouping: false });
  });
}

function amountFmt(n) {
  if (!n) return "0";
  return minusMark(Math.round(n), v => String(v));
}

function renderItemsInput() {
  const body = document.getElementById("itemsInputBody");
  body.innerHTML = "";
  items.forEach((item, idx) => {
    if (pageCount() > 1 && (idx === 0 || (idx >= layout().rows && (idx - layout().rows) % CONT_ROWS === 0))) {
      const sep = document.createElement("tr");
      sep.className = "page-sep";
      sep.innerHTML = `<td colspan="6">${pageOfItem(idx)}ページ目${idx === 0 ? "" : "(内訳)"}</td>`;
      body.appendChild(sep);
    }
    const tr = document.createElement("tr");
    const amount = itemAmount(item);
    tr.innerHTML = `
      <td class="col-name"><input type="text" value="${escapeAttr(item.name)}" data-idx="${idx}" data-field="name"></td>
      <td class="col-qty"><input type="number" step="any" value="${item.qty}" data-idx="${idx}" data-field="qty"></td>
      <td class="col-unit"><input type="text" value="${escapeAttr(item.unit)}" data-idx="${idx}" data-field="unit"></td>
      <td class="col-price"><input type="number" step="${layout().items.plainNumbers ? 1 : 0.01}" max="999999999" value="${item.price}" data-idx="${idx}" data-field="price"></td>
      <td class="col-amount"><span class="item-amount" data-idx="${idx}">${amount ? yen(amount) : ""}</span></td>
      <td class="col-remarks"><input type="text" value="${escapeAttr(item.remarks)}" data-idx="${idx}" data-field="remarks"></td>
    `;
    body.appendChild(tr);
  });

  const totalTr = document.createElement("tr");
  totalTr.className = "total-row";
  totalTr.innerHTML = `
    <td class="col-name" colspan="3"><span class="total-hint">別紙の明細内容がある場合、品名に「別紙参照」と記載。別紙明細がある場合、別紙ファイルを添付して下さい。</span></td>
    <td class="col-price"><span class="total-label">合計</span></td>
    <td class="col-amount"><span class="item-amount" id="itemsTotalAmount"></span></td>
    <td class="col-remarks"></td>
  `;
  body.appendChild(totalTr);

  const info = document.getElementById("pageInfo");
  if (info) info.textContent = `全${pageCount()}ページ(1ページ目 ${layout().rows}行・内訳ページ 各${CONT_ROWS}行)`;
  const removeBtn = document.getElementById("btnRemovePage");
  if (removeBtn) removeBtn.disabled = extraPages === 0;

  body.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", onItemFieldChange);
  });

  updateAmounts();
}

function updateAmounts() {
  let total = 0;
  items.forEach((item, idx) => {
    const amount = itemAmount(item);
    total += amount;
    const span = document.querySelector(`.item-amount[data-idx="${idx}"]`);
    if (span) span.textContent = amount ? yen(amount) : "";
  });
  const totalSpan = document.getElementById("itemsTotalAmount");
  if (totalSpan) totalSpan.textContent = yen(total);
}

function escapeAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function onItemFieldChange(e) {
  const idx = Number(e.target.dataset.idx);
  const field = e.target.dataset.field;
  let value = e.target.value;
  if (field === "qty" || field === "price") {
    value = value === "" ? "" : parseFloat(value) || 0;
    if (field === "price" && value > 999999999) {
      value = 999999999;
      e.target.value = value;
    }
  }
  items[idx][field] = value;
  if (field === "qty" || field === "price") updateAmounts();
  renderPreview();
  saveDraft();
}

function addItem() {
  items.push(emptyItem());
  renderItemsInput();
  renderPreview();
  saveDraft();
}

function getField(id) {
  return document.getElementById(id).value;
}

// 事業所CD（2026-11-12 基幹系変更に伴い 010〜090 → 100〜700 に変更）。
// 保存データ・下書きに残っている旧い値（例: "本店|010"）は、読み込み時に新しい値に読み替える
const BRANCH_TYPE_RENAMED = { "本店|010": "本店|100", "横浜支店|030": "横浜支店|200", "東関東支店|020": "東関東支店|300", "北関東支店|090": "北関東支店|400", "大阪支店|040": "大阪支店|500", "仙台支店|060": "仙台支店|600", "名古屋支店|050": "名古屋支店|700" };

function setField(id, value) {
  if (id === "branchType") value = BRANCH_TYPE_RENAMED[value] || value;
  document.getElementById(id).value = value ?? "";
}

function splitDate(iso) {
  if (!iso) return { y: "", m: "", d: "" };
  const [y, m, d] = iso.split("-");
  return { y, m: String(Number(m)), d: String(Number(d)) };
}

function addOverlay(layer, xPx, yPx, text, extraClass) {
  if (text === "" || text === undefined || text === null) return;
  const span = document.createElement("span");
  span.className = "ov" + (extraClass ? " " + extraClass : "");
  span.style.left = mm(xPx) + "mm";
  span.style.top = mm(yPx) + "mm";
  span.textContent = text;
  layer.appendChild(span);
}

// 右端(rightXPx)に合わせて右寄せで配置する(桁数が多い金額が次の列にめり込まないように)
function addOverlayRight(layer, rightXPx, widthPx, yPx, text, extraClass) {
  if (text === "" || text === undefined || text === null) return;
  const span = document.createElement("span");
  span.className = "ov" + (extraClass ? " " + extraClass : "");
  span.style.left = mm(rightXPx - widthPx) + "mm";
  span.style.top = mm(yPx) + "mm";
  span.style.width = mm(widthPx) + "mm";
  span.style.textAlign = "right";
  span.textContent = text;
  layer.appendChild(span);
}

// 中心(centerXPx)を基準に中央寄せで配置する
function addOverlayCenter(layer, centerXPx, widthPx, yPx, text, extraClass) {
  if (text === "" || text === undefined || text === null) return;
  const span = document.createElement("span");
  span.className = "ov" + (extraClass ? " " + extraClass : "");
  span.style.left = mm(centerXPx - widthPx / 2) + "mm";
  span.style.top = mm(yPx) + "mm";
  span.style.width = mm(widthPx) + "mm";
  span.style.textAlign = "center";
  span.textContent = text;
  layer.appendChild(span);
}

// .ov と同じフォントで文字列の幅を測り、150dpi基準pxで返す
let measureCtx = null;
function measureOverlayTextPx(text) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  const fontPx = 4.11 * 96 / 25.4; // style.css の .ov font-size(4.11mm)をCSS pxに換算
  measureCtx.font = `${fontPx}px "MS Gothic", "Yu Gothic", "Hiragino Sans", sans-serif`;
  return measureCtx.measureText(text).width * 150 / 96;
}

// 中心(centerXPx)を基準に中央寄せで配置し、widthPxを超える場合は横方向に縮小して収める
function addOverlayFit(layer, centerXPx, widthPx, yPx, text, extraClass) {
  if (text === "" || text === undefined || text === null) return;
  const span = document.createElement("span");
  span.className = "ov" + (extraClass ? " " + extraClass : "");
  const textW = measureOverlayTextPx(text);
  const scale = textW > widthPx ? widthPx / textW : 1;
  span.style.left = mm(centerXPx - textW * scale / 2) + "mm";
  span.style.top = mm(yPx) + "mm";
  if (scale < 1) {
    span.style.transform = `scaleX(${scale})`;
    span.style.transformOrigin = "left top";
  }
  span.textContent = text;
  layer.appendChild(span);
}

// 左端(xPx)から配置し、widthPxを超える場合は横方向に縮小して収める(縦の帳票の品名・備考・業者情報用)
function addOverlayFitLeft(layer, xPx, widthPx, yPx, text, extraClass) {
  if (text === "" || text === undefined || text === null) return;
  const span = document.createElement("span");
  span.className = "ov" + (extraClass ? " " + extraClass : "");
  const textW = measureOverlayTextPx(String(text));
  span.style.left = mm(xPx) + "mm";
  span.style.top = mm(yPx) + "mm";
  if (textW > widthPx) {
    span.style.transform = `scaleX(${widthPx / textW})`;
    span.style.transformOrigin = "left top";
  }
  span.textContent = text;
  layer.appendChild(span);
}

// 右端(rightXPx)に合わせて右寄せで配置し、widthPxを超える場合は横方向に縮小して収める(縦の帳票の単価・金額用)
function addOverlayFitRight(layer, rightXPx, widthPx, yPx, text, extraClass) {
  if (text === "" || text === undefined || text === null) return;
  const span = document.createElement("span");
  span.className = "ov" + (extraClass ? " " + extraClass : "");
  const textW = measureOverlayTextPx(String(text));
  const scale = textW > widthPx ? widthPx / textW : 1;
  span.style.left = mm(rightXPx - textW * scale) + "mm";
  span.style.top = mm(yPx) + "mm";
  if (scale < 1) {
    span.style.transform = `scaleX(${scale})`;
    span.style.transformOrigin = "left top";
  }
  span.textContent = text;
  layer.appendChild(span);
}

// widthPx が指定されていれば縮小して収め、無ければ従来どおり置くだけ(横の帳票は従来の見た目を維持)
function addOverlayMaybeFit(layer, xPx, widthPx, yPx, text, extraClass) {
  if (widthPx) addOverlayFitLeft(layer, xPx, widthPx, yPx, text, extraClass);
  else addOverlay(layer, xPx, yPx, text, extraClass);
}

function digitGridDigits(amount) {
  const numStr = amountFmt(Math.round(amount || 0)); // マイナスは先頭に▲
  const padded = numStr.padStart(11, " ").slice(-11);
  return padded.split("");
}

function bgSrc(color) {
  return layout().bg[color === "red" ? "red" : "blue"]();
}

// ===== 業者見積日のチェック: 工期(開始)を過ぎた業者見積日は不可(社内ルール) =====
// 入力欄の下に警告を出し、日付を変えたときと、プレビュー・保存の前に確認する(止めはしない)
function quoteDateProblem() {
  const quote = getField("vendorQuoteDate");
  const start = getField("periodStart");
  if (!quote || !start || quote <= start) return "";
  // 日付欄に年を1桁ずつ入力している途中(0002年など)は判定しない
  if (quote < "1900" || start < "1900") return "";
  const fmt = (iso) => iso.replace(/-/g, "/");
  return `業者見積日(${fmt(quote)})が工期(開始)(${fmt(start)})を過ぎています。工期(開始)を過ぎた業者見積日は不可です。`;
}

function renderQuoteDateWarning() {
  const msg = quoteDateProblem();
  const el = document.getElementById("quoteDateWarning");
  if (el) {
    el.textContent = msg ? "⚠ " + msg : "";
    el.style.display = msg ? "block" : "none";
  }
  ["vendorQuoteDate", "periodStart"].forEach(id => document.getElementById(id).classList.toggle("input-warn", !!msg));
}

function confirmQuoteDate(action) {
  const msg = quoteDateProblem();
  return !msg || confirm(`${msg}\n\nこのまま${action}しますか?`);
}

function renderPreview() {
  renderQuoteDateWarning();
  const data = collectFormData();
  document.getElementById("bgImage").src = bgSrc(data.themeColor);
  buildOverlay(document.getElementById("overlayLayer"), data, true);
  syncContPages(document.getElementById("printSource"), document.getElementById("printArea"), "A", data.themeColor, data, false);
  renderAltPreview();
}

function renderAltPreview() {
  const data = collectFormData();
  const altTheme = data.themeColor === "red" ? "blue" : "red";
  document.getElementById("bgImageAlt").src = bgSrc(altTheme);
  buildOverlay(document.getElementById("overlayLayerAlt"), data, false);
  syncContPages(document.getElementById("printSource"), document.getElementById("printAreaAlt"), "B", altTheme, data, false);
}

// ===== 内訳ページ(縦・2ページ目以降) =====

// ページ番号と「－次葉に続く－」(続きがあるページのみ)
function addPageMarks(layer, pos, page, total) {
  addOverlayRight(layer, pos.pageNoRight, P(30), pos.pageNoY, `${page} / ${total}`);
  if (page < total) addOverlayCenter(layer, pos.nextPage.center, P(80), pos.nextPage.y, "－ 次 葉 に 続 く －");
}

// 内訳ページ(page は2始まり)の印字。最終ページの最終行は全ページの合計、それ以外はそのページの小計
function buildContOverlay(layer, data, page) {
  layer.innerHTML = "";
  const CT = PORTRAIT_CONT;
  const IL = CT.items;
  addOverlayFitLeft(layer, CT.projectX, CT.projectWidth, CT.headerY, data.projectName);
  addOverlayFitLeft(layer, CT.vendorX, CT.vendorWidth, CT.headerY, data.vendorName);

  const start = layout().rows + (page - 2) * CONT_ROWS;
  let pageSubtotal = 0;
  for (let r = 0; r < CONT_ROWS; r++) {
    const item = items[start + r] || emptyItem();
    const amount = itemAmount(item);
    pageSubtotal += amount;
    addItemRowOverlay(layer, IL, IL.rowTop + r * IL.rowHeight + IL.textOffset, item, amount);
  }

  const total = pageCount();
  const last = page === total;
  const grand = items.reduce((sum, it) => sum + itemAmount(it), 0);
  const totalRowY = IL.rowTop + CONT_ROWS * IL.rowHeight + IL.textOffset;
  addOverlayCenter(layer, IL.totalLabelCenter, P(40), totalRowY, last ? "合　計" : "小　計");
  addOverlayFitRight(layer, IL.cols.amountRight, IL.cols.amountWidth, totalRowY, yenMark(last ? grand : pageSubtotal));
  addPageMarks(layer, CT, page, total);
}

// 内訳ページの要素を anchor(1ページ目)の直後に並べる。set は "A"(1部目)/"B"(2部目)、withLabels はプレビュー画面用の見出し付き
function syncContPages(container, anchor, set, color, data, withLabels) {
  container.querySelectorAll(`[data-cont-set="${set}"]`).forEach(el => el.remove());
  const total = pageCount();
  let after = anchor;
  for (let page = 2; page <= total; page++) {
    if (withLabels) {
      const label = document.createElement("p");
      label.className = "preview-modal-label";
      label.dataset.contSet = set;
      label.textContent = `▼ ${set === "A" ? 1 : 2}部目 ${page}/${total}ページ(内訳)`;
      after.after(label);
      after = label;
    }
    const pageEl = document.createElement("div");
    pageEl.className = "quote-page cont-page" + (set === "B" && !withLabels ? " print-only" : "");
    pageEl.dataset.contSet = set;
    const img = document.createElement("img");
    img.className = "bg-image";
    img.alt = "";
    img.src = LAYOUTS.portrait.contBg[color === "red" ? "red" : "blue"]();
    const layer = document.createElement("div");
    layer.className = "overlay-layer";
    pageEl.append(img, layer);
    after.after(pageEl);
    after = pageEl;
    buildContOverlay(layer, data, page);
  }
}

// 明細1行分の印字(1ページ目・内訳ページ共通)
function addItemRowOverlay(layer, IL, rowY, item, amount) {
  addOverlayMaybeFit(layer, IL.cols.name, IL.cols.nameWidth, rowY, item.name);
  addOverlayRight(layer, IL.cols.qtyRight, IL.cols.qtyWidth, rowY, item.qty);
  addOverlayCenter(layer, IL.cols.unitCenter, IL.cols.unitWidth, rowY, item.unit);
  if (IL.plainNumbers) {
    // 縦の帳票: 単価は円単位(銭は四捨五入)、単価・金額ともカンマ付きで右寄せ
    if (Number(item.qty) !== 1 && item.price) {
      addOverlayFitRight(layer, IL.cols.priceRight, IL.cols.priceWidth, rowY, yen(unitPrice(item)));
    }
    if (amount) addOverlayFitRight(layer, IL.cols.amountRight, IL.cols.amountWidth, rowY, yen(amount));
  } else {
    if (Number(item.qty) !== 1) {
      addOverlayRight(layer, IL.cols.priceRight, IL.cols.priceWidth, rowY, priceFmt(item.price), "ov-price");
    }
    addOverlayRight(layer, IL.cols.amountRight, IL.cols.amountWidth, rowY, amount ? amountFmt(amount) : "", "ov-amount");
  }
  addOverlayMaybeFit(layer, IL.cols.remarks, IL.cols.remarksWidth, rowY, item.remarks);
}

// 縦の帳票の上段(業者見積日・番号、工事情報、業者情報、法定福利費)を印字する
function buildPortraitHeader(layer, data, C) {
  const qd = splitDate(data.vendorQuoteDate);
  [qd.y, qd.m, qd.d].forEach((v, i) => addOverlayRight(layer, C.quoteDateRights[i], P(14), C.quoteDateY, v));
  addOverlayFit(layer, C.quoteNoCenter, C.quoteNoWidth, C.quoteNoY, data.vendorQuoteNo);

  const [branchName, branchCode] = data.branchType ? data.branchType.split("|") : ["", ""];
  addOverlay(layer, C.valueX, C.branchY, branchCode || "");
  addOverlay(layer, C.branchNameX, C.branchY, branchName || "");
  addOverlayFitLeft(layer, C.valueX, C.valueWidth, C.projectNoY, data.projectNo);
  addOverlayFitLeft(layer, C.valueX, C.valueWidth, C.projectNameY, data.projectName);
  addOverlayFitLeft(layer, C.valueX, C.valueWidth, C.siteLocationY, data.siteLocation);

  const ps = splitDate(data.periodStart);
  const pe = splitDate(data.periodEnd);
  [ps.y, ps.m, ps.d, pe.y, pe.m, pe.d].forEach((v, i) => addOverlayRight(layer, C.periodRights[i], P(14), C.periodY, v));
  addOverlayRight(layer, C.validDaysRight, P(14), C.validDaysY, data.validDays);

  addOverlayFitLeft(layer, C.vendorX, C.vendorWidth, C.vendorAddressY, data.vendorAddress);
  addOverlayFitLeft(layer, C.vendorX, C.vendorWidth, C.vendorNameY, data.vendorName);
  addOverlayFitLeft(layer, C.vendorX, C.vendorWidth, C.vendorTelY, data.vendorTel);
  addOverlayFit(layer, C.vendorCodeCenter, C.vendorCodeWidth, C.vendorCodeY, data.vendorCode);

  addOverlayRight(layer, C.welfareRight, P(30), C.welfareY, data.welfareCost ? yen(data.welfareCost) : "");
}

function buildOverlay(layer, data, enableStampDrag) {
  layer.innerHTML = "";
  const L = layout();
  const C = L.coords;
  const IL = L.items;
  const DG = L.digitGrid;

  if (L.portraitHeader) {
    buildPortraitHeader(layer, data, C);
  } else {
    const qd = splitDate(data.vendorQuoteDate);
    addOverlay(layer, C.vendorQuoteDate_y.x, C.vendorQuoteDate_y.y, qd.y);
    addOverlay(layer, C.vendorQuoteDate_m.x, C.vendorQuoteDate_m.y, qd.m);
    addOverlay(layer, C.vendorQuoteDate_d.x, C.vendorQuoteDate_d.y, qd.d);
    addOverlayCenter(layer, C.vendorQuoteNoCenter, 160, C.vendorQuoteNo.y, data.vendorQuoteNo);

    const [branchName, branchCode] = data.branchType ? data.branchType.split("|") : ["", ""];
    addOverlay(layer, C.branchCode.x, C.branchCode.y, branchCode || "");
    addOverlay(layer, C.branchName.x, C.branchName.y, branchName || "");

    addOverlayFit(layer, C.projectNoCenter, C.projectNoWidth, C.projectNo.y, data.projectNo);
    addOverlay(layer, C.projectName.x, C.projectName.y, data.projectName);
    addOverlay(layer, C.siteLocation.x, C.siteLocation.y, data.siteLocation);

    const ps = splitDate(data.periodStart);
    const pe = splitDate(data.periodEnd);
    addOverlay(layer, C.period_y1.x, C.period_y1.y, ps.y);
    addOverlay(layer, C.period_m1.x, C.period_m1.y, ps.m);
    addOverlay(layer, C.period_d1.x, C.period_d1.y, ps.d);
    addOverlay(layer, C.period_y2.x, C.period_y2.y, pe.y);
    addOverlay(layer, C.period_m2.x, C.period_m2.y, pe.m);
    addOverlay(layer, C.period_d2.x, C.period_d2.y, pe.d);

    addOverlay(layer, C.validDays.x, C.validDays.y, data.validDays);

    addOverlayMaybeFit(layer, C.vendorAddress.x, C.vendorTextWidth, C.vendorAddress.y, data.vendorAddress);
    addOverlayMaybeFit(layer, C.vendorName.x, C.vendorTextWidth, C.vendorName.y, data.vendorName);
    addOverlayMaybeFit(layer, C.vendorTel.x, C.vendorTextWidth, C.vendorTel.y, data.vendorTel);
    addOverlayCenter(layer, C.vendorCodeCenter, C.vendorCodeWidth, C.vendorCode.y, data.vendorCode);
  }

  [
    { url: stampDataUrl4, xf: "stampX4", yf: "stampY4", sf: "stampSize4" },
    { url: stampDataUrl,  xf: "stampX",  yf: "stampY",  sf: "stampSize"  },
    { url: stampDataUrl2, xf: "stampX2", yf: "stampY2", sf: "stampSize2" },
    { url: stampDataUrl3, xf: "stampX3", yf: "stampY3", sf: "stampSize3" },
  ].forEach(s => {
    if (!s.url) return;
    const img = document.createElement("img");
    img.className = "ov-stamp";
    img.src = s.url;
    img.style.left   = mm(Number(data[s.xf]) || 0) + "mm";
    img.style.top    = mm(Number(data[s.yf]) || 0) + "mm";
    img.style.width  = mm(Number(data[s.sf]) || 110) + "mm";
    img.style.height = mm(Number(data[s.sf]) || 110) + "mm";
    if (enableStampDrag) img.addEventListener("mousedown", (e) => onStampDragStart(e, layer, s.xf, s.yf));
    layer.appendChild(img);
  });

  if (!L.portraitHeader) addOverlay(layer, C.welfareCost.x, C.welfareCost.y, data.welfareCost ? yen(data.welfareCost) : "");

  if (data.notes) {
    const span = document.createElement("span");
    span.className = "ov ov-notes";
    span.style.left = mm(C.notes.x) + "mm";
    span.style.top = mm(C.notes.y) + "mm";
    span.textContent = data.notes.split("\n").slice(0, L.notesMaxLines).join("\n");
    layer.appendChild(span);
  }

  let subtotal = 0;
  let pageSubtotal = 0; // 1ページ目の小計(内訳ページがあるとき)
  const rowCount = Math.max(items.length, L.rows);
  for (let i = 0; i < rowCount; i++) {
    const item = items[i] || emptyItem();
    const amount = itemAmount(item);
    subtotal += amount;
    if (i < L.rows) pageSubtotal += amount;
    if (i >= L.rows && orientation === "portrait") continue; // 縦の帳票は枠外に印字しない(合計には含める)
    const rowY = IL.rowTop + i * IL.rowHeight + IL.textOffset;
    addItemRowOverlay(layer, IL, rowY, item, amount);
  }

  const totalRowY = IL.totalRowY !== undefined ? IL.totalRowY : IL.rowTop + L.rows * IL.rowHeight + IL.textOffset;
  const multiPage = pageCount() > 1;
  if (IL.totalLabelCenter) addOverlayCenter(layer, IL.totalLabelCenter, P(40), totalRowY, multiPage ? "小　計" : "合　計");
  else addOverlay(layer, IL.cols.name, totalRowY, "合計");
  if (IL.plainNumbers) {
    addOverlayFitRight(layer, IL.cols.amountRight, IL.cols.amountWidth, totalRowY, yenMark(multiPage ? pageSubtotal : subtotal));
    if (multiPage) addPageMarks(layer, C, 1, pageCount());
  } else {
    const totalStr = amountFmt(subtotal);
    const totalCharWidth = 26.5; // 概算: グリフ幅+letter-spacing(6.5pt)分
    const totalYenRightX = IL.cols.amountRight - (totalStr.length * totalCharWidth) - 2;
    addOverlayRight(layer, IL.cols.amountRight, IL.cols.amountWidth, totalRowY, totalStr, "ov-amount");
    addOverlayRight(layer, totalYenRightX, 30, totalRowY, "¥", "ov-amount");
  }

  if (L.portraitHeader) {
    addOverlayRight(layer, C.totalRight, C.totalWidth, C.totalY, yen(subtotal), "ov-total");
  } else {
    const digits = digitGridDigits(subtotal);
    const firstDigitIndex = digits.findIndex(ch => ch.trim() !== "");
    const yenRightX = (firstDigitIndex === -1 ? DG.x0 + DG.colWidth * (digits.length - 1) : DG.x0 + firstDigitIndex * DG.colWidth) - 4;
    addOverlayRight(layer, yenRightX, DG.colWidth, DG.y, "¥", "ov-digit");

    digits.forEach((ch, i) => {
      if (ch.trim() === "") return;
      const x = DG.x0 + i * DG.colWidth;
      const span = document.createElement("span");
      span.className = "ov ov-digit";
      span.style.left = mm(x) + "mm";
      span.style.top = mm(DG.y) + "mm";
      span.style.width = mm(DG.colWidth) + "mm";
      span.textContent = ch;
      layer.appendChild(span);
    });
  }
}

// ===== 帳票の向きの切替 =====

function readStampPosFields() {
  const pos = {};
  STAMP_POS_IDS.forEach(id => { pos[id] = Number(getField(id)) || 0; });
  return pos;
}

function writeStampPosFields(pos) {
  STAMP_POS_IDS.forEach(id => setField(id, Math.round(Number(pos[id]) || 0)));
}

// 明細の行数を向きの既定行数に合わせる(空行の追加と末尾の空行の削除のみ。入力済みの行は消さない)
function fitItemsToRows() {
  if (orientation === "portrait") {
    // 入力済みの行が収まるだけの内訳ページを確保する
    extraPages = Math.max(extraPages, Math.ceil((lastFilledItemCount() - layout().rows) / CONT_ROWS), 0);
  }
  while (items.length < itemCapacity()) items.push(emptyItem());
  items = trimTrailingEmptyRows(items);
}

function lastFilledItemCount() {
  for (let i = items.length - 1; i >= 0; i--) {
    if (!isEmptyItem(items[i])) return i + 1;
  }
  return 0;
}

function applyOrientationView() {
  document.body.classList.toggle("orient-portrait", orientation === "portrait");
  let style = document.getElementById("pageOrientationStyle");
  if (!style) {
    style = document.createElement("style");
    style.id = "pageOrientationStyle";
    document.head.appendChild(style);
  }
  style.textContent = `@media print { @page { size: A4 ${orientation}; margin: 0; } }`;
  const sel = document.getElementById("orientation");
  if (sel) sel.value = orientation;
}

// 向きを切り替える。押印位置は今の向きの位置を退避し、切替先の位置(未調整なら既定値)を入れる
function setOrientation(next) {
  if (LAYOUTS[next] && next !== orientation) {
    stampPos[orientation] = readStampPosFields();
    orientation = next;
    writeStampPosFields(stampPos[next] || LAYOUTS[next].stampDefaults);
    fitItemsToRows();
  }
  applyOrientationView();
}

// 読み込んだデータの向き・押印位置を復元する(fieldIds・items を反映した後に呼ぶ)。
// 向きの情報が無い旧データは横の帳票で作られたもの: 押印位置を横の位置として引き継ぎ、既定の向きで開く。
function restoreOrientation(data) {
  stampPos = data.stampPos && typeof data.stampPos === "object" ? { ...data.stampPos } : {};
  orientation = LAYOUTS[data.orientation] ? data.orientation : "landscape";
  setOrientation(LAYOUTS[data.orientation] ? data.orientation : DEFAULT_ORIENTATION);
  fitItemsToRows();
}

function onOrientationChange(e) {
  const next = e.target.value;
  if (next === "landscape" && lastFilledItemCount() > LAYOUTS.landscape.rows) {
    if (!confirm(`A4横の帳票は明細${LAYOUTS.landscape.rows}行までです。${LAYOUTS.landscape.rows + 1}行目以降は枠の外に印字されます。A4横に切り替えますか?`)) {
      e.target.value = orientation;
      return;
    }
  }
  setOrientation(next);
  renderItemsInput();
  renderPreview();
  saveDraft();
}

function collectFormData() {
  const data = {};
  fieldIds.forEach(id => {
    data[id] = getField(id);
  });
  data.orientation = orientation;
  data.extraPages = extraPages;
  data.stampPos = { ...stampPos, [orientation]: readStampPosFields() };
  data.stampDataUrl  = stampDataUrl;
  data.stampDataUrl2 = stampDataUrl2;
  data.stampDataUrl3 = stampDataUrl3;
  data.stampDataUrl4 = stampDataUrl4;
  data.attachments   = attachments;
  data.a0004         = a0004;
  return data;
}

// ブラウザ内保存(localStorage)は約5MBが上限。添付PDF/画像が多いと超過して例外になり、
// 呼び出し元(印刷実行など)の処理まで止まってしまうため、ここで例外を握りつぶす。
// 超過時は添付を除いて保存し、添付は「ファイルに保存」で残すよう一度だけ案内する。
let draftQuotaWarned = false;
function saveDraft() {
  const data = collectFormData();
  data.items = items;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return;
  } catch (err) {
    console.warn("ブラウザ内保存に失敗しました(添付を除いて再保存します):", err);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, attachments: [] }));
  } catch (err) {
    console.error("ブラウザ内保存に失敗しました:", err);
  }
  if (!draftQuotaWarned) {
    draftQuotaWarned = true;
    alert("添付ファイルの容量が大きいため、添付ファイルはブラウザ内に自動保存できません。\n" +
          "入力内容と添付ファイルを残すには「ファイルに保存」を使用してください。\n" +
          "(このまま印刷することはできます)");
  }
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = (header.match(/data:(.*?);base64/) || [, "application/octet-stream"])[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function rotateImageToLandscape(dataUrl, callback) {
  const img = new Image();
  img.onload = function () {
    if (img.naturalWidth >= img.naturalHeight) {
      callback(dataUrl);
      return;
    }
    // 縦長 → 90°CW回転して横長に
    const c = document.createElement("canvas");
    c.width  = img.naturalHeight;
    c.height = img.naturalWidth;
    const ctx = c.getContext("2d");
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0);
    callback(c.toDataURL("image/png"));
  };
  img.src = dataUrl;
}

function rotateImageToLandscapeAsync(dataUrl) {
  return new Promise(resolve => rotateImageToLandscape(dataUrl, resolve));
}

// ===== PDF添付をページ画像化(pdf.js) =====
// プレビュー・印刷に画像と同じ扱いで含めるため、添付時に各ページをPNGへ事前レンダリングしておく。

const PDF_RENDER_DPI = 150; // 他の座標系(150dpi基準px)と揃える

function setupPdfWorker() {
  if (typeof pdfjsLib === "undefined") return;
  const dataEl = document.getElementById("pdfWorkerB64");
  const b64 = dataEl ? dataEl.textContent.trim() : "";
  if (b64) {
    // 配布用(単一HTML)バンドル: base64埋め込みのworkerコードをBlob化して使う
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "text/javascript" });
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  } else {
    // 開発版: 相対パスのファイルをそのまま使う
    pdfjsLib.GlobalWorkerOptions.workerSrc = "pdfjs/pdf.worker.min.js";
  }
}

// PDFの各ページをPNG dataURLの配列にレンダリングする。失敗時は空配列を返す(呼び出し側でフォールバック表示)。
async function renderPdfPagesToImages(pdfDataUrl) {
  if (typeof pdfjsLib === "undefined") return [];
  try {
    const pdf = await pdfjsLib.getDocument({ url: pdfDataUrl }).promise;
    const images = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: PDF_RENDER_DPI / 72 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      images.push(await rotateImageToLandscapeAsync(canvas.toDataURL("image/png")));
    }
    return images;
  } catch (err) {
    console.error("PDFのページ変換に失敗しました:", err);
    return [];
  }
}

// 添付一覧のうち、まだページ画像化されていないPDF(古い保存データ・pdf.js未対応環境等)を
// バックグラウンドで変換する。完了したものから順次一覧・プレビューへ反映する。
function backfillPdfPages() {
  attachments.forEach(att => {
    if (att.type !== "application/pdf" || Array.isArray(att.pages)) return;
    renderPdfPagesToImages(att.dataUrl).then(pages => {
      att.pages = pages;
      renderAttachmentList();
      renderPreview();
      saveDraft();
    });
  });
}

function buildAttachmentPages(container) {
  container.querySelectorAll(".attachment-page").forEach(el => el.remove());
  attachments.forEach(att => {
    if (att.type.startsWith("image/")) {
      const page = document.createElement("div");
      page.className = "quote-page attachment-page";
      const img = document.createElement("img");
      img.src = att.dataUrl;
      page.appendChild(img);
      container.appendChild(page);
    } else if (att.type === "application/pdf" && Array.isArray(att.pages)) {
      att.pages.forEach(pageDataUrl => {
        const page = document.createElement("div");
        page.className = "quote-page attachment-page";
        const img = document.createElement("img");
        img.src = pageDataUrl;
        page.appendChild(img);
        container.appendChild(page);
      });
    }
  });
}

function renderAttachmentList() {
  const ul = document.getElementById("attachmentList");
  ul.innerHTML = "";
  attachments.forEach((att, idx) => {
    const li = document.createElement("li");
    li.className = "attachment-item";
    const isImage = att.type.startsWith("image/");
    const thumb = isImage
      ? `<img class="attachment-thumb" src="${att.dataUrl}" alt="">`
      : `<span style="font-size:20px;flex-shrink:0">📄</span>`;
    const openBtn = !isImage
      ? `<button class="btn-open-attachment" data-idx="${idx}">開く</button>`
      : "";
    let pdfNote = "";
    if (!isImage) {
      if (!Array.isArray(att.pages)) {
        pdfNote = `<span class="attachment-pdf-note attachment-pdf-note-pending">変換中…</span>`;
      } else if (att.pages.length === 0) {
        pdfNote = `<span class="attachment-pdf-note attachment-pdf-note-warn">変換失敗・「開く」で個別に確認してください</span>`;
      } else {
        pdfNote = `<span class="attachment-pdf-note attachment-pdf-note-ok">${att.pages.length}ページ・印刷に自動反映</span>`;
      }
    }
    li.innerHTML = `${thumb}<span class="attachment-name">${att.name}</span>${pdfNote}${openBtn}<button class="btn-remove-attachment" data-idx="${idx}">削除</button>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll(".btn-open-attachment").forEach(btn => {
    btn.addEventListener("click", () => {
      // data URLをそのままwindow.open()するとChromeのトップレベルナビゲーション制限で
      // 開けない(何も表示されない)ことがあるため、blob URLに変換してから開く。
      const att = attachments[Number(btn.dataset.idx)];
      window.open(URL.createObjectURL(dataUrlToBlob(att.dataUrl)), "_blank");
    });
  });
  ul.querySelectorAll(".btn-remove-attachment").forEach(btn => {
    btn.addEventListener("click", () => {
      attachments.splice(Number(btn.dataset.idx), 1);
      renderAttachmentList();
      saveDraft();
    });
  });
}

function openPrintPreview() {
  renderPreview();
  const data = collectFormData();
  data.items = items;
  const color = document.getElementById("themeColor").value;
  document.getElementById("previewBgA").src = bgSrc(color);
  document.getElementById("previewBgB").src = bgSrc(color === "blue" ? "red" : "blue");
  buildOverlay(document.getElementById("previewLayerA"), data, true);
  buildOverlay(document.getElementById("previewLayerB"), data, false);
  const modalBody = document.getElementById("previewModal").querySelector(".preview-modal-body");
  syncContPages(modalBody, document.getElementById("previewPageA"), "A", color, data, true);
  syncContPages(modalBody, document.getElementById("previewPageB"), "B", color === "blue" ? "red" : "blue", data, true);
  const total = pageCount();
  document.getElementById("previewLabelA").textContent = total > 1 ? `▼ 1部目 1/${total}ページ` : "▼ 1ページ目";
  document.getElementById("previewLabelB").textContent = total > 1 ? `▼ 2部目 1/${total}ページ` : "▼ 2ページ目";
  buildAttachmentPages(document.getElementById("previewModal").querySelector(".preview-modal-body"));
  buildAttachmentPages(document.getElementById("printSource"));
  document.getElementById("previewModal").style.display = "flex";
}

function closePrintPreview() {
  document.getElementById("previewModal").style.display = "none";
}

function suggestedFileName() {
  const data = collectFormData();
  const sanitize = (s) => (s || "").replace(/[\\/:*?"<>|]/g, "").trim();
  const projectNo = sanitize(data.projectNo);
  const dateStr = (data.vendorQuoteDate || todayIso()).replace(/-/g, "");
  const quoteNo = sanitize(data.vendorQuoteNo);
  const name = sanitize(data.vendorName);
  const parts = [projectNo, "見積書", dateStr, quoteNo, name].filter(Boolean);
  return parts.join("_") + ".json";
}

async function saveToFile() {
  if (!confirmQuoteDate("ファイルに保存")) return;
  saveDraft();
  const data = collectFormData();
  data.items = items;
  const json = JSON.stringify(data, null, 2);

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestedFileName(),
        types: [{ description: "見積書データ", accept: { "application/json": [".json"] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
    } catch (err) {
      if (err.name !== "AbortError") alert("保存に失敗しました: " + err.message);
    }
    return;
  }

  const defaultName = suggestedFileName();
  const fileName = prompt("ファイル名を確認・編集してください（.json）", defaultName);
  if (!fileName) return;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".json") ? fileName : fileName + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===== 社内回送用HTML保存 =====
// 業者が保存するJSONは受け取った側もこのアプリが無いと開けず不便なため、
// 現在の入力内容を埋め込んだ「このアプリ自体のコピー」を1つのHTMLファイルとして書き出す。
// 配布用(単一HTML化)バージョンで開いている場合のみ動作する(開発版はstyle.css/script.js等が
// 別ファイル参照のままのため、自己完結なコピーにならない)。

function isBundledSingleFile() {
  return !document.querySelector('link[rel="stylesheet"][href="style.css"]');
}

function suggestedInternalHtmlFileName() {
  return suggestedFileName().replace(/\.json$/, "") + "_社内確認用.html";
}

// 単一HTML化ビルドと同じ理由(埋め込みJSON内に "</script" が含まれるとタグが途中で
// 閉じてしまいページが壊れる)で、埋め込む前に必ずエスケープする。
function escapeScriptCloseText(text) {
  return text.replace(/<\/script/gi, "<\\/script");
}

function buildInternalForwardHtml() {
  closePrintPreview();
  closeCsvImportModal();
  closeA0004Modals();
  const data = collectFormData();
  data.items = items;
  const json = escapeScriptCloseText(JSON.stringify(data));

  const clone = document.documentElement.cloneNode(true);
  // 動的に書き換わる要素は空にしておく(bootstrapのapplyLoadedData()実行時に再構築される)
  clone.querySelectorAll("#overlayLayer, #overlayLayerAlt, #previewLayerA, #previewLayerB, #itemsInputBody, #attachmentList, #csvImportBody, #a0004View, #a0004VendorList, #a0004Print")
    .forEach(el => { el.innerHTML = ""; });
  const previewModalEl = clone.querySelector("#previewModal");
  if (previewModalEl) previewModalEl.style.display = "none";
  const csvModalEl = clone.querySelector("#csvImportModal");
  if (csvModalEl) csvModalEl.style.display = "none";
  clone.querySelectorAll('input[type="file"]').forEach(el => el.removeAttribute("value"));

  const bootstrap = document.createElement("script");
  bootstrap.textContent =
    'document.addEventListener("DOMContentLoaded", function () {\n' +
    '  if (typeof applyLoadedData === "function") {\n' +
    '    applyLoadedData(' + json + ');\n' +
    '  }\n' +
    '});';
  clone.querySelector("body").appendChild(bootstrap);

  return "<!DOCTYPE html>\n" + clone.outerHTML;
}

async function saveToInternalHtml() {
  if (!isBundledSingleFile()) {
    alert("この機能は配布用(単一HTML)ファイルでのみ利用できます。開発版では使用できません。");
    return;
  }
  if (!confirmQuoteDate("保存")) return;
  saveDraft();
  const htmlText = buildInternalForwardHtml();
  const fileName = suggestedInternalHtmlFileName();

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: "見積書(社内回送用HTML)", accept: { "text/html": [".html"] } }]
      });
      const writable = await handle.createWritable();
      await writable.write(htmlText);
      await writable.close();
    } catch (err) {
      if (err.name !== "AbortError") alert("保存に失敗しました: " + err.message);
    }
    return;
  }

  const blob = new Blob([htmlText], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function applyLoadedData(data) {
  fieldIds.forEach(id => {
    if (data[id] !== undefined) setField(id, data[id]);
  });
  stampDataUrl  = data.stampDataUrl  || null;
  stampDataUrl2 = data.stampDataUrl2 || null;
  stampDataUrl3 = data.stampDataUrl3 || null;
  stampDataUrl4 = data.stampDataUrl4 || null;
  attachments = Array.isArray(data.attachments) ? data.attachments : [];
  a0004 = data.a0004 && data.a0004.values ? data.a0004 : null;
  extraPages = Number(data.extraPages) || 0;
  items = Array.isArray(data.items) && data.items.length ? trimTrailingEmptyRows(data.items) : [];
  restoreOrientation(data);
  renderItemsInput();
  renderAttachmentList();
  renderA0004Status();
  renderPreview();
  saveDraft();
  backfillPdfPages(); // 古い保存データにpdf.jsページ変換結果が無ければ補完する
}

async function openFromFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "見積書データ", accept: { "application/json": [".json"] } }]
      });
      const file = await handle.getFile();
      const text = await file.text();
      applyLoadedData(JSON.parse(text));
    } catch (err) {
      if (err.name !== "AbortError") alert("読み込みに失敗しました: " + err.message);
    }
    return;
  }
  document.getElementById("fileInput").click();
}

function loadDraft() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    orientation = DEFAULT_ORIENTATION;
    writeStampPosFields(layout().stampDefaults);
    applyOrientationView();
    items = Array.from({ length: layout().rows }, emptyItem);
    setField("vendorQuoteDate", todayIso());
    setField("themeColor", "blue");
    renderItemsInput();
    renderA0004Status();
    renderPreview();
    return;
  }
  const data = JSON.parse(raw);
  fieldIds.forEach(id => {
    if (data[id] !== undefined) setField(id, data[id]);
  });
  stampDataUrl  = data.stampDataUrl  || null;
  stampDataUrl2 = data.stampDataUrl2 || null;
  stampDataUrl3 = data.stampDataUrl3 || null;
  stampDataUrl4 = data.stampDataUrl4 || null;
  attachments = Array.isArray(data.attachments) ? data.attachments : [];
  a0004 = data.a0004 && data.a0004.values ? data.a0004 : null;
  extraPages = Number(data.extraPages) || 0;
  items = Array.isArray(data.items) && data.items.length ? trimTrailingEmptyRows(data.items) : [];
  restoreOrientation(data);
  renderItemsInput();
  renderAttachmentList();
  renderA0004Status();
  renderPreview();
  backfillPdfPages(); // 古い保存データにpdf.jsページ変換結果が無ければ補完する
}

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function refreshModalPreview() {
  if (document.getElementById("previewModal").style.display === "none") return;
  const data = collectFormData();
  data.items = items;
  buildOverlay(document.getElementById("previewLayerA"), data, true);
  buildOverlay(document.getElementById("previewLayerB"), data, false);
}

function onStampDragStart(e, dragLayer, xField, yField) {
  e.preventDefault();
  const rect = dragLayer.getBoundingClientRect();
  const scale = rect.width / layout().pageW; // ページ幅(150dpi基準px): 横1754 / 縦1240
  const startClientX = e.clientX;
  const startClientY = e.clientY;
  const origX = Number(getField(xField)) || 0;
  const origY = Number(getField(yField)) || 0;

  function onMove(ev) {
    const dx = (ev.clientX - startClientX) / scale;
    const dy = (ev.clientY - startClientY) / scale;
    setField(xField, Math.round(origX + dx));
    setField(yField, Math.round(origY + dy));
    refreshModalPreview();
    renderPreview();
  }
  function onUp() {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    saveDraft();
  }
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

const KEEP_ON_NEW_IDS = [
  "vendorAddress", "vendorName", "vendorTel", "vendorCode",
  "stampX",  "stampY",  "stampSize",
  "stampX2", "stampY2", "stampSize2",
  "stampX3", "stampY3", "stampSize3",
  "stampX4", "stampY4", "stampSize4",
];

// ===== 内訳ページの追加・削除(縦のみ) =====

function addContPage() {
  if (orientation !== "portrait") return;
  extraPages++;
  fitItemsToRows();
  renderItemsInput();
  renderPreview();
  saveDraft();
}

function removeContPage() {
  if (orientation !== "portrait" || extraPages === 0) return;
  const start = layout().rows + (extraPages - 1) * CONT_ROWS;
  const filled = items.slice(start).filter(it => !isEmptyItem(it)).length;
  if (filled && !confirm(`最終ページ(${pageCount()}ページ目)に入力した明細${filled}行も削除されます。削除しますか?`)) return;
  items = items.slice(0, start);
  extraPages--;
  fitItemsToRows();
  renderItemsInput();
  renderPreview();
  saveDraft();
}

function newQuotation() {
  if (!confirm("入力中の内容を破棄して新規作成しますか?(住所・社名・電話・業者コード・電子印は維持されます)")) return;
  const kept = {};
  KEEP_ON_NEW_IDS.forEach(id => { kept[id] = getField(id); });
  const keptStampDataUrl  = stampDataUrl;
  const keptStampDataUrl2 = stampDataUrl2;
  const keptStampDataUrl3 = stampDataUrl3;
  const keptStampDataUrl4 = stampDataUrl4;

  localStorage.removeItem(STORAGE_KEY);
  fieldIds.forEach(id => setField(id, ""));
  setField("themeColor", "blue");
  setField("vendorQuoteDate", todayIso());

  KEEP_ON_NEW_IDS.forEach(id => setField(id, kept[id]));
  stampDataUrl  = keptStampDataUrl;
  stampDataUrl2 = keptStampDataUrl2;
  stampDataUrl3 = keptStampDataUrl3;
  stampDataUrl4 = keptStampDataUrl4;

  attachments = [];
  a0004 = null;
  extraPages = 0;
  items = Array.from({ length: layout().rows }, emptyItem);
  renderItemsInput();
  renderAttachmentList();
  renderA0004Status();
  renderPreview();
  saveDraft();
}

// ===== CSV取込(工事情報: 事業所/工番/工事名/施工場所/工期) =====

const CSV_COLUMNS = ["事業所", "工番", "工事名", "施工場所", "工期(開始)", "工期(終了)"];

// Excelの「CSV(コンマ区切り)」保存はShift_JIS、「CSV UTF-8」保存はUTF-8になるため両対応する。
// UTF-8として厳密デコードして失敗したらShift_JISとして読み直す。
async function readCsvFile(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

function parseCsv(text) {
  const src = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = "";
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim() !== ""));
}

function normalizeDate(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // Excelのシリアル値(1900年1月1日=1)で保存されたセルへのフォールバック
  if (/^\d{4,6}$/.test(s)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + Number(s) * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return "";
}

function matchBranchType(raw) {
  const s = (raw || "").trim();
  if (!s) return "";
  const select = document.getElementById("branchType");
  for (const opt of select.options) {
    if (!opt.value) continue;
    const [label, code] = opt.value.split("|");
    if (s === opt.value || s === label || s === code || s === `${label}(${code})`) return opt.value;
  }
  return "";
}

function parseCsvRows(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  const idx = {};
  CSV_COLUMNS.forEach(col => { idx[col] = header.indexOf(col); });
  const missing = CSV_COLUMNS.filter(col => idx[col] === -1);
  if (missing.length) {
    throw new Error("CSVのヘッダーに次の列が見つかりません: " + missing.join("、"));
  }
  return rows.slice(1).map(r => {
    const periodStartRaw = (r[idx["工期(開始)"]] || "").trim();
    const periodEndRaw   = (r[idx["工期(終了)"]] || "").trim();
    return {
      branchTypeRaw: (r[idx["事業所"]] || "").trim(),
      projectNo:     (r[idx["工番"]] || "").trim(),
      projectName:   (r[idx["工事名"]] || "").trim(),
      siteLocation:  (r[idx["施工場所"]] || "").trim(),
      periodStartRaw,
      periodEndRaw,
      periodStart: normalizeDate(periodStartRaw),
      periodEnd:   normalizeDate(periodEndRaw),
    };
  });
}

let csvImportRows = [];

function openCsvImportModal(rows) {
  csvImportRows = rows;
  const body = document.getElementById("csvImportBody");
  body.innerHTML = "";
  rows.forEach((row, i) => {
    const branchValue = matchBranchType(row.branchTypeRaw);
    const branchLabel = branchValue ? branchValue.split("|")[0] : (row.branchTypeRaw ? `${row.branchTypeRaw}(未一致)` : "(空欄)");
    const startOk = !row.periodStartRaw || row.periodStart;
    const endOk = !row.periodEndRaw || row.periodEnd;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="${branchValue ? "" : "csv-row-warn"}">${escapeAttr(branchLabel)}</td>
      <td>${escapeAttr(row.projectNo)}</td>
      <td>${escapeAttr(row.projectName)}</td>
      <td>${escapeAttr(row.siteLocation)}</td>
      <td class="${startOk ? "" : "csv-row-warn"}">${escapeAttr(row.periodStart || row.periodStartRaw)}</td>
      <td class="${endOk ? "" : "csv-row-warn"}">${escapeAttr(row.periodEnd || row.periodEndRaw)}</td>
      <td><button type="button" class="btn-csv-apply" data-idx="${i}">この行を取込</button></td>
    `;
    body.appendChild(tr);
  });
  document.getElementById("csvImportSummary").textContent =
    `${rows.length}件のデータが見つかりました。取込む行の「この行を取込」を押してください。(オレンジ色の項目は自動変換できませんでした)`;
  body.querySelectorAll(".btn-csv-apply").forEach(btn => {
    btn.addEventListener("click", () => applyCsvRow(Number(btn.dataset.idx)));
  });
  document.getElementById("csvImportModal").style.display = "flex";
}

function closeCsvImportModal() {
  document.getElementById("csvImportModal").style.display = "none";
}

function applyCsvRow(idx) {
  const row = csvImportRows[idx];
  if (!row) return;
  const branchValue = matchBranchType(row.branchTypeRaw);
  if (row.branchTypeRaw && !branchValue) {
    alert(`事業所「${row.branchTypeRaw}」は選択肢と一致しませんでした。事業所は手動で選択してください。`);
  }
  if (branchValue) setField("branchType", branchValue);
  setField("projectNo", row.projectNo);
  setField("projectName", row.projectName);
  setField("siteLocation", row.siteLocation);
  if (row.periodStart) setField("periodStart", row.periodStart);
  if (row.periodEnd) setField("periodEnd", row.periodEnd);
  closeCsvImportModal();
  renderPreview();
  saveDraft();
}

function downloadCsvTemplate() {
  const header = CSV_COLUMNS.join(",");
  const example = ["本店", "26-0001", "〇〇ビル新築電気設備工事", "東京都千代田区〇〇1-2-3", "2026-08-01", "2026-12-20"].join(",");
  const csv = "﻿" + header + "\r\n" + example + "\r\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "工事情報_取込ひな形.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===== 見積依頼書(本-購買-A0004)の取込・表示・印刷 =====
// Y-Format で保存したJSONから工番・工事名(工事名称)・施工場所を取り込み、見積依頼書は見積書データに一緒に保存する。
// 事業所は見積依頼書に無いので取り込まない(業者が選ぶ)。

function renderA0004Status() {
  const status = document.getElementById("a0004Status");
  if (!status) return;
  const has = !!(a0004 && a0004.values);
  status.className = "a0004-status" + (has ? "" : " empty");
  status.textContent = has
    ? `取込済み: ${a0004.code} ${a0004.values.koban || ""} ${a0004.values.gyosha ? "(" + a0004.values.gyosha + " 殿)" : ""}`
    : "見積依頼書は取り込まれていません";
  document.getElementById("btnViewA0004").disabled = !has;
  const removeBtn = document.getElementById("btnRemoveA0004");
  if (removeBtn) removeBtn.disabled = !has;
}

function closeA0004Modals() {
  ["a0004Modal", "a0004VendorModal"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
  const view = document.getElementById("a0004View");
  if (view) view.innerHTML = "";
}

// 業者名の空白・法人格の違いを無視して自社の分を探す(業者選択の目印にするだけ)
function normalizeCompanyName(s) {
  return String(s || "").replace(/[\s　]/g, "").replace(/株式会社|有限会社|合同会社|\(株\)|（株）|\(有\)|（有）|㈱|㈲|殿|御中/g, "");
}

function onA0004FileText(text, fileName) {
  let parsed;
  try {
    parsed = A0004.parse(text);
  } catch (err) {
    alert(err.message);
    return;
  }
  if (parsed.vendors.length === 1) {
    applyA0004(parsed, 1, fileName);
    return;
  }
  const own = normalizeCompanyName(getField("vendorName"));
  const list = document.getElementById("a0004VendorList");
  list.innerHTML = "";
  parsed.vendors.forEach(vd => {
    const li = document.createElement("li");
    if (own && normalizeCompanyName(vd.name) === own) li.className = "match";
    const name = document.createElement("span");
    name.className = "a0004-vendor-name";
    name.textContent = `${vd.n}社目: ${vd.name || "(業者名なし)"}` + (li.className ? " ← 自社名と一致" : "");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "この業者で取込";
    btn.addEventListener("click", () => {
      document.getElementById("a0004VendorModal").style.display = "none";
      applyA0004(parsed, vd.n, fileName);
    });
    li.append(name, btn);
    list.appendChild(li);
  });
  document.getElementById("a0004VendorModal").style.display = "flex";
}

function applyA0004(parsed, n, fileName) {
  const next = A0004.extract(parsed, n, fileName);
  const v = next.values;
  if (a0004 && !confirm("取り込み済みの見積依頼書を、このファイルの内容に置き換えますか?")) return;
  // 工事情報: 入力済みで違う値のときは確認してから上書き
  const map = [["projectNo", "工番", v.koban], ["projectName", "工事名", v.kojiName], ["siteLocation", "施工場所", v.basho]];
  const diffs = map.filter(([id, , val]) => val && getField(id) && getField(id) !== String(val));
  let overwrite = true;
  if (diffs.length) {
    overwrite = confirm("工事情報を見積依頼書の内容で上書きしますか?\n\n" +
      diffs.map(([id, label, val]) => `${label}: ${getField(id)} → ${val}`).join("\n") +
      "\n\n(「キャンセル」なら入力済みの値はそのままにして、見積依頼書だけ取り込みます)");
  }
  map.forEach(([id, , val]) => {
    if (!val) return;
    if (!getField(id) || overwrite) setField(id, String(val));
  });
  a0004 = next;
  renderA0004Status();
  renderPreview();
  saveDraft();
  const notes = [];
  if (!getField("branchType")) notes.push("事業所は見積依頼書に無いため、選択してください。");
  alert("見積依頼書を取り込みました。" + (notes.length ? "\n" + notes.join("\n") : ""));
}

function openA0004View() {
  if (!a0004) return;
  A0004.render(document.getElementById("a0004View"), a0004);
  document.getElementById("a0004Modal").style.display = "flex";
}

function removeA0004() {
  if (!a0004) return;
  if (!confirm("取り込んだ見積依頼書を外しますか?(工番・工事名・施工場所の入力はそのまま残ります)")) return;
  a0004 = null;
  renderA0004Status();
  saveDraft();
}

document.addEventListener("DOMContentLoaded", () => {
  setupPdfWorker();
  loadDraft();

  document.getElementById("btnAddAttachment").addEventListener("click", () => {
    document.getElementById("attachmentInput").click();
  });

  document.getElementById("attachmentInput").addEventListener("change", (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith("image/"));
    if (!files.length) { e.target.value = ""; return; }
    let pending = files.length;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        rotateImageToLandscape(reader.result, (rotatedUrl) => {
          attachments.push({ name: file.name, type: file.type, dataUrl: rotatedUrl });
          pending--;
          if (pending === 0) { renderAttachmentList(); saveDraft(); }
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  });

  document.getElementById("btnAddPdfAttachment").addEventListener("click", () => {
    document.getElementById("pdfAttachmentInput").click();
  });

  document.getElementById("pdfAttachmentInput").addEventListener("change", (e) => {
    const files = Array.from(e.target.files).filter(f => f.type === "application/pdf");
    if (!files.length) { e.target.value = ""; return; }
    let pending = files.length;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const att = { name: file.name, type: file.type, dataUrl: reader.result, pages: null };
        attachments.push(att);
        pending--;
        if (pending === 0) { renderAttachmentList(); saveDraft(); }
        renderPdfPagesToImages(att.dataUrl).then(pages => {
          att.pages = pages;
          renderAttachmentList();
          renderPreview();
          saveDraft();
        });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  });

  document.getElementById("btnImportCsv").addEventListener("click", () => {
    document.getElementById("csvInput").click();
  });
  document.getElementById("csvInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readCsvFile(file);
      const rows = parseCsvRows(text);
      if (!rows.length) { alert("CSVにデータ行が見つかりませんでした。"); return; }
      openCsvImportModal(rows);
    } catch (err) {
      alert("CSVの読込に失敗しました: " + err.message);
    }
  });
  document.getElementById("btnImportA0004").addEventListener("click", () => {
    document.getElementById("a0004Input").click();
  });
  document.getElementById("a0004Input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    onA0004FileText(await file.text(), file.name);
  });
  document.getElementById("btnViewA0004").addEventListener("click", openA0004View);
  document.getElementById("btnRemoveA0004").addEventListener("click", removeA0004);
  document.getElementById("btnPrintA0004").addEventListener("click", () => {
    closeA0004Modals();
    A0004.print(a0004);
  });
  ["btnCloseA0004", "btnCloseA0004b", "btnCloseA0004Vendor"].forEach(id => {
    document.getElementById(id).addEventListener("click", closeA0004Modals);
  });
  document.getElementById("btnDownloadCsvTemplate").addEventListener("click", downloadCsvTemplate);
  document.getElementById("btnCloseCsvImport").addEventListener("click", closeCsvImportModal);
  document.getElementById("btnCloseCsvImport2").addEventListener("click", closeCsvImportModal);

  document.getElementById("btnAddItem").addEventListener("click", addItem);
  document.getElementById("btnAddPage").addEventListener("click", addContPage);
  document.getElementById("btnRemovePage").addEventListener("click", removeContPage);
  document.getElementById("btnNew").addEventListener("click", newQuotation);
  document.getElementById("btnSave").addEventListener("click", () => {
    saveDraft();
    alert("保存しました。");
  });
  document.getElementById("btnSaveFile").addEventListener("click", saveToFile);
  document.getElementById("btnSaveInternalHtml").addEventListener("click", saveToInternalHtml);
  document.getElementById("btnOpenFile").addEventListener("click", openFromFile);
  document.getElementById("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    applyLoadedData(JSON.parse(text));
    e.target.value = "";
  });
  document.getElementById("orientation").addEventListener("change", onOrientationChange);
  document.getElementById("btnPrint").addEventListener("click", () => {
    if (confirmQuoteDate("プレビュー")) openPrintPreview();
  });
  // 業者見積日・工期(開始)を変えて、工期(開始)を過ぎた見積日になったらその場で知らせる
  ["vendorQuoteDate", "periodStart"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      const msg = quoteDateProblem();
      if (msg) alert(msg);
    });
  });
  document.getElementById("btnClosePreview").addEventListener("click", closePrintPreview);
  document.getElementById("btnClosePreview2").addEventListener("click", closePrintPreview);
  document.getElementById("btnPrintFromPreview").addEventListener("click", () => {
    closePrintPreview();
    try { saveDraft(); } catch (err) { console.error(err); } // 保存に失敗しても印刷は続行する
    window.print();
  });

  document.getElementById("notes").addEventListener("input", (e) => {
    const lines = e.target.value.split("\n");
    const maxLines = layout().notesMaxLines;
    if (lines.length > maxLines) {
      e.target.value = lines.slice(0, maxLines).join("\n");
    }
  });

  [
    { inputId: "stampImage4", removeId: "btnRemoveStamp4", setUrl: v => { stampDataUrl4 = v; } },
    { inputId: "stampImage",  removeId: "btnRemoveStamp",  setUrl: v => { stampDataUrl  = v; } },
    { inputId: "stampImage2", removeId: "btnRemoveStamp2", setUrl: v => { stampDataUrl2 = v; } },
    { inputId: "stampImage3", removeId: "btnRemoveStamp3", setUrl: v => { stampDataUrl3 = v; } },
  ].forEach(({ inputId, removeId, setUrl }) => {
    document.getElementById(inputId).addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { setUrl(reader.result); renderPreview(); saveDraft(); };
      reader.readAsDataURL(file);
    });
    document.getElementById(removeId).addEventListener("click", () => {
      setUrl(null);
      document.getElementById(inputId).value = "";
      renderPreview();
      saveDraft();
    });
  });

  fieldIds.forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      renderPreview();
      saveDraft();
    });
    document.getElementById(id).addEventListener("change", () => {
      renderPreview();
      saveDraft();
    });
  });
});
