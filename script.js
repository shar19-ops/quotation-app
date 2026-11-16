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

// ===== 帳票の向き(A4横=現行 / A4縦=β版) =====
// A4縦の帳票(assets/*_bg_portrait.png)は templates/portrait/build_portrait_template.py で
// A4横の帳票から部品を切り出して組み立てている。縦の座標は「横の座標 + 部品の移動量」で計算する
// (移動量は同スクリプトの PLACE の値。200dpi px の移動量 × 0.75 = 150dpi px)。
const DEFAULT_ORIENTATION = "portrait"; // β版は縦が既定。承認前の本番(main)は横のまま

// 横の座標(px@150)を、部品の移動量(px@200)だけずらす
function shiftPt(pt, dx200, dy200) {
  return { x: pt.x + dx200 * 0.75, y: pt.y + dy200 * 0.75 };
}

const PORTRAIT_COORDS = (() => {
  const C = COORDS;
  const QUOTE = [-646, -37];   // 業者見積日・番号
  const PROJECT = [-50, -35];  // 本支店区分〜見積有効期限
  const VENDOR = [-1422, 263]; // 住所・社名・電話
  const CODE = [-651, 30];     // 業者コード・業者担当者印
  return {
    vendorQuoteDate_y: shiftPt(C.vendorQuoteDate_y, ...QUOTE),
    vendorQuoteDate_m: shiftPt(C.vendorQuoteDate_m, ...QUOTE),
    vendorQuoteDate_d: shiftPt(C.vendorQuoteDate_d, ...QUOTE),
    vendorQuoteNo:     shiftPt(C.vendorQuoteNo, ...QUOTE),
    vendorQuoteNoCenter: C.vendorQuoteNoCenter + QUOTE[0] * 0.75,

    branchCode:   shiftPt(C.branchCode, ...PROJECT),
    branchName:   shiftPt(C.branchName, ...PROJECT),
    projectNo:    shiftPt(C.projectNo, ...PROJECT),
    projectNoCenter: C.projectNoCenter + PROJECT[0] * 0.75,
    projectNoWidth: C.projectNoWidth,
    projectName:  shiftPt(C.projectName, ...PROJECT),
    siteLocation: shiftPt(C.siteLocation, ...PROJECT),

    period_y1: shiftPt(C.period_y1, ...PROJECT),
    period_m1: shiftPt(C.period_m1, ...PROJECT),
    period_d1: shiftPt(C.period_d1, ...PROJECT),
    period_y2: shiftPt(C.period_y2, ...PROJECT),
    period_m2: shiftPt(C.period_m2, ...PROJECT),
    period_d2: shiftPt(C.period_d2, ...PROJECT),

    validDays: shiftPt(C.validDays, ...PROJECT),

    vendorAddress: shiftPt(C.vendorAddress, ...VENDOR),
    vendorName:    shiftPt(C.vendorName, ...VENDOR),
    vendorTel:     shiftPt(C.vendorTel, ...VENDOR),
    vendorTextWidth: 600, // 住所・社名・電話の印字幅(px@150)。超える場合は横方向に縮小
    vendorCode:    shiftPt(C.vendorCode, ...CODE),
    vendorCodeCenter: C.vendorCodeCenter + CODE[0] * 0.75,
    vendorCodeWidth: C.vendorCodeWidth,

    // 法定福利費: 部品を0.8倍に縮小して見積総額の右に配置(1040,895 px@200)
    // (横の印字位置1389px@200 は切り出し元の左端1135から254px → 縮小後203px。縦位置は文字の中心を合わせる)
    welfareCost: { x: (1040 + (1389.3 - 1135) * 0.8) * 0.75, y: 674 },

    // 註記: 「-次葉に続く- 註記」の下(846,2155 px@200)
    notes: { x: 846 * 0.75, y: 2155 * 0.75 }
  };
})();

// 明細表(縦): build_portrait_template.py の TABLE と対応(px@200 × 0.75)
const PORTRAIT_ITEMS_LAYOUT = (() => {
  const PITCH = 35.227;
  const priceSenLeft = 686 + PITCH * 7;          // 銭の境
  const amountRight = 686 + PITCH * 9 + PITCH * 10;
  const rowH = 49.5;
  return {
    rowTop: (1000 + 55) * 0.75,
    rowHeight: rowH * 0.75,
    textOffset: (rowH * 0.75 - 4.11 / PX2MM) / 2 + 0.5,
    cols: {
      name: (94 + 28) * 0.75,
      nameWidth: (494 - 8 - 122) * 0.75,         // 品名の印字幅。超える場合は横方向に縮小
      qtyRight: (606 - 19.3) * 0.75,
      qtyWidth: 80,
      unitCenter: (606 + 686) / 2 * 0.75,
      unitWidth: 55,
      priceRight: (priceSenLeft + 9.2) * 0.75,
      priceWidth: 220,
      senRight: (priceSenLeft + PITCH * 2 + 9.2) * 0.75, // 銭(2桁)は網掛けの2マスに入れる
      amountRight: (amountRight + 8.5) * 0.75,
      amountWidth: 300,
      remarks: (amountRight + 14) * 0.75,
      remarksWidth: (1559 - 8 - amountRight - 14) * 0.75 // 備考の印字幅。超える場合は横方向に縮小
    }
  };
})();

const LAYOUTS = {
  landscape: {
    pageW: 1754, pageH: 1240,
    coords: COORDS,
    digitGrid: DIGIT_GRID,
    items: ITEMS_LAYOUT,
    rows: 9,
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
    digitGrid: { x0: DIGIT_GRID.x0 - 50 * 0.75, colWidth: DIGIT_GRID.colWidth, y: DIGIT_GRID.y + 201 * 0.75 },
    items: PORTRAIT_ITEMS_LAYOUT,
    rows: 20,
    bg: {
      blue: () => document.getElementById("bgBluePortraitSrc").src,
      red:  () => document.getElementById("bgRedPortraitSrc").src
    },
    stampDefaults: {
      stampX4: 600, stampY4: 505,
      stampX: 1586 - 651 * 0.75, stampY: 538 + 30 * 0.75,
      stampX2: 1497 - 651 * 0.75, stampY2: 538 + 30 * 0.75,
      stampX3: 1410 - 651 * 0.75, stampY3: 538 + 30 * 0.75
    }
  }
};

let orientation = DEFAULT_ORIENTATION;
const layout = () => LAYOUTS[orientation];

// 押印位置は向きごとに別々に保持する(横で調整した位置を縦に持ち込まない)
const STAMP_POS_IDS = ["stampX", "stampY", "stampX2", "stampY2", "stampX3", "stampY3", "stampX4", "stampY4"];
let stampPos = {}; // { landscape: {stampX: .., ...}, portrait: {...} }

let items = [];

function emptyItem() {
  return { name: "", qty: "", unit: "", price: "", remarks: "" };
}

function isEmptyItem(item) {
  return !item.name && !item.qty && !item.unit && !item.price && !item.remarks;
}

// 末尾の空行を今の向きの既定行数(横9行・縦20行)まで詰める(過去の10行時代のデータにも対応)
function trimTrailingEmptyRows(arr) {
  const result = arr.slice();
  while (result.length > layout().rows && isEmptyItem(result[result.length - 1])) {
    result.pop();
  }
  return result;
}

function yen(n) {
  if (!n) return "0";
  return Math.round(n).toLocaleString("ja-JP");
}

function priceFmt(n) {
  if (!n) return "";
  const hasFraction = Math.round(n * 100) % 100 !== 0;
  return n.toLocaleString("ja-JP", { minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2, useGrouping: false });
}

function amountFmt(n) {
  if (!n) return "0";
  return String(Math.round(n));
}

function renderItemsInput() {
  const body = document.getElementById("itemsInputBody");
  body.innerHTML = "";
  items.forEach((item, idx) => {
    const tr = document.createElement("tr");
    const amount = (item.qty || 0) * (item.price || 0);
    tr.innerHTML = `
      <td class="col-name"><input type="text" value="${escapeAttr(item.name)}" data-idx="${idx}" data-field="name"></td>
      <td class="col-qty"><input type="number" step="any" value="${item.qty}" data-idx="${idx}" data-field="qty"></td>
      <td class="col-unit"><input type="text" value="${escapeAttr(item.unit)}" data-idx="${idx}" data-field="unit"></td>
      <td class="col-price"><input type="number" step="0.01" max="999999999" value="${item.price}" data-idx="${idx}" data-field="price"></td>
      <td class="col-amount"><span class="item-amount" data-idx="${idx}">${amount ? amount.toLocaleString("ja-JP") : ""}</span></td>
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

  body.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", onItemFieldChange);
  });

  updateAmounts();
}

function updateAmounts() {
  let total = 0;
  items.forEach((item, idx) => {
    const amount = (item.qty || 0) * (item.price || 0);
    total += amount;
    const span = document.querySelector(`.item-amount[data-idx="${idx}"]`);
    if (span) span.textContent = amount ? amount.toLocaleString("ja-JP") : "";
  });
  const totalSpan = document.getElementById("itemsTotalAmount");
  if (totalSpan) totalSpan.textContent = total.toLocaleString("ja-JP");
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

// widthPx が指定されていれば縮小して収め、無ければ従来どおり置くだけ(横の帳票は従来の見た目を維持)
function addOverlayMaybeFit(layer, xPx, widthPx, yPx, text, extraClass) {
  if (widthPx) addOverlayFitLeft(layer, xPx, widthPx, yPx, text, extraClass);
  else addOverlay(layer, xPx, yPx, text, extraClass);
}

function digitGridDigits(amount) {
  const numStr = String(Math.max(0, Math.round(amount || 0)));
  const padded = numStr.padStart(11, " ").slice(-11);
  return padded.split("");
}

function bgSrc(color) {
  return layout().bg[color === "red" ? "red" : "blue"]();
}

function renderPreview() {
  const data = collectFormData();
  document.getElementById("bgImage").src = bgSrc(data.themeColor);
  buildOverlay(document.getElementById("overlayLayer"), data, true);
  renderAltPreview();
}

function renderAltPreview() {
  const data = collectFormData();
  const altTheme = data.themeColor === "red" ? "blue" : "red";
  document.getElementById("bgImageAlt").src = bgSrc(altTheme);
  buildOverlay(document.getElementById("overlayLayerAlt"), data, false);
}

function buildOverlay(layer, data, enableStampDrag) {
  layer.innerHTML = "";
  const L = layout();
  const C = L.coords;
  const IL = L.items;
  const DG = L.digitGrid;

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

  addOverlay(layer, C.welfareCost.x, C.welfareCost.y, data.welfareCost ? yen(data.welfareCost) : "");

  if (data.notes) {
    const span = document.createElement("span");
    span.className = "ov ov-notes";
    span.style.left = mm(C.notes.x) + "mm";
    span.style.top = mm(C.notes.y) + "mm";
    span.textContent = data.notes;
    layer.appendChild(span);
  }

  let subtotal = 0;
  const rowCount = Math.max(items.length, L.rows);
  for (let i = 0; i < rowCount; i++) {
    const item = items[i] || emptyItem();
    const amount = (item.qty || 0) * (item.price || 0);
    subtotal += amount;
    if (i >= L.rows && orientation === "portrait") continue; // 縦の帳票は枠外に印字しない(合計には含める)
    const rowY = IL.rowTop + i * IL.rowHeight + IL.textOffset;
    addOverlayMaybeFit(layer, IL.cols.name, IL.cols.nameWidth, rowY, item.name);
    addOverlayRight(layer, IL.cols.qtyRight, IL.cols.qtyWidth, rowY, item.qty);
    addOverlayCenter(layer, IL.cols.unitCenter, IL.cols.unitWidth, rowY, item.unit);
    if (Number(item.qty) !== 1) {
      if (IL.cols.senRight && item.price) {
        // 縦の帳票: 整数部を銭の境に右寄せし、銭は小数点を付けずに網掛けの2マスへ
        const [intPart, senPart] = Number(item.price).toFixed(2).split(".");
        addOverlayRight(layer, IL.cols.priceRight, IL.cols.priceWidth, rowY, intPart, "ov-price");
        if (senPart !== "00") addOverlayRight(layer, IL.cols.senRight, 60, rowY, senPart, "ov-price");
      } else {
        addOverlayRight(layer, IL.cols.priceRight, IL.cols.priceWidth, rowY, priceFmt(item.price), "ov-price");
      }
    }
    addOverlayRight(layer, IL.cols.amountRight, IL.cols.amountWidth, rowY, amount ? amountFmt(amount) : "", "ov-amount");
    addOverlayMaybeFit(layer, IL.cols.remarks, IL.cols.remarksWidth, rowY, item.remarks);
  }

  const totalRowY = IL.totalRowY !== undefined ? IL.totalRowY : IL.rowTop + L.rows * IL.rowHeight + IL.textOffset;
  addOverlay(layer, IL.cols.name, totalRowY, "合計");
  const totalStr = amountFmt(subtotal);
  const totalCharWidth = 26.5; // 概算: グリフ幅+letter-spacing(6.5pt)分
  const totalYenRightX = IL.cols.amountRight - (totalStr.length * totalCharWidth) - 2;
  addOverlayRight(layer, IL.cols.amountRight, IL.cols.amountWidth, totalRowY, totalStr, "ov-amount");
  addOverlayRight(layer, totalYenRightX, 30, totalRowY, "¥", "ov-amount");

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
  while (items.length < layout().rows) items.push(emptyItem());
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
  data.stampPos = { ...stampPos, [orientation]: readStampPosFields() };
  data.stampDataUrl  = stampDataUrl;
  data.stampDataUrl2 = stampDataUrl2;
  data.stampDataUrl3 = stampDataUrl3;
  data.stampDataUrl4 = stampDataUrl4;
  data.attachments   = attachments;
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
  const data = collectFormData();
  data.items = items;
  const json = escapeScriptCloseText(JSON.stringify(data));

  const clone = document.documentElement.cloneNode(true);
  // 動的に書き換わる要素は空にしておく(bootstrapのapplyLoadedData()実行時に再構築される)
  clone.querySelectorAll("#overlayLayer, #overlayLayerAlt, #previewLayerA, #previewLayerB, #itemsInputBody, #attachmentList, #csvImportBody")
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
  items = Array.isArray(data.items) && data.items.length ? trimTrailingEmptyRows(data.items) : [];
  restoreOrientation(data);
  renderItemsInput();
  renderAttachmentList();
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
  items = Array.isArray(data.items) && data.items.length ? trimTrailingEmptyRows(data.items) : [];
  restoreOrientation(data);
  renderItemsInput();
  renderAttachmentList();
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
  items = Array.from({ length: layout().rows }, emptyItem);
  renderItemsInput();
  renderAttachmentList();
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
  document.getElementById("btnDownloadCsvTemplate").addEventListener("click", downloadCsvTemplate);
  document.getElementById("btnCloseCsvImport").addEventListener("click", closeCsvImportModal);
  document.getElementById("btnCloseCsvImport2").addEventListener("click", closeCsvImportModal);

  document.getElementById("btnAddItem").addEventListener("click", addItem);
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
  document.getElementById("btnPrint").addEventListener("click", openPrintPreview);
  document.getElementById("btnClosePreview").addEventListener("click", closePrintPreview);
  document.getElementById("btnClosePreview2").addEventListener("click", closePrintPreview);
  document.getElementById("btnPrintFromPreview").addEventListener("click", () => {
    closePrintPreview();
    try { saveDraft(); } catch (err) { console.error(err); } // 保存に失敗しても印刷は続行する
    window.print();
  });

  document.getElementById("notes").addEventListener("input", (e) => {
    const lines = e.target.value.split("\n");
    if (lines.length > 4) {
      e.target.value = lines.slice(0, 4).join("\n");
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
