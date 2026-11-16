// 社員用見積書アプリ: 業者が保存したJSONを読み込み、工事情報のみ修正可能。
// 業者(自社)情報・明細内容・添付ファイルは閲覧のみ(添付ファイルは削除不可)。

// 担当者確認印の氏名・役職は同じ担当者が繰り返し使う想定でブラウザに記憶する(確認日は都度入力し直すため対象外)。
const STAFF_STAMP_PREF_KEY = "quotationApp.employee.staffStampPref";

function saveStaffStampPref() {
  const pref = { name: getField("staffStampName"), title: getField("staffStampTitle") };
  localStorage.setItem(STAFF_STAMP_PREF_KEY, JSON.stringify(pref));
}

function loadStaffStampPref() {
  const raw = localStorage.getItem(STAFF_STAMP_PREF_KEY);
  if (!raw) return;
  try {
    const pref = JSON.parse(raw);
    setField("staffStampName", pref.name);
    setField("staffStampTitle", pref.title);
  } catch (e) { /* 壊れたデータは無視 */ }
}

// 背景画像src: HTMLのimg要素から読む
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

// 各項目を書き込む座標(px, 150dpi基準)。業者用アプリと同一の座標定義。
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

// 担当者確認印(デート印)の配置。PDF左下の空欄4マスのうち、左から4番目(右端)セルの中央。
// 200dpi元画像でセル境界を実測(1マス幅181px, 左端セルx:144-325)し、150dpi基準pxに換算(×0.75)。
// 右へ3マス分移動: 176 + 181*0.75*3 = 583
const STAFF_STAMP_CENTER = { x: 583, y: 1143 };
const STAFF_STAMP_SIZE = 100;

// 支払伝票PJ版と同じ役職→色のデフォルト対応(副長・課長=黒、工事長以上=赤)
const STAFF_TITLE_DEFAULT_COLOR = { "": "black", "副長": "black", "課長": "black", "工事長": "red", "支店長": "red", "部長": "red", "本部長": "red", "取締役": "red", "常務": "red", "本店長": "red" };

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

// 明細表(縦): build_portrait_template.py の TABLE と対応(px@200 × 0.75)。
// 単価・金額は桁の縦線・銭の欄が無いので、カンマ付きで右寄せ(字間なし)に印字する。
const PORTRAIT_ITEMS_LAYOUT = (() => {
  const rowH = 49.5;
  const pad = 14; // 罫線から数字までの余白(px@200)
  return {
    rowTop: (1000 + 55) * 0.75,
    rowHeight: rowH * 0.75,
    textOffset: (rowH * 0.75 - 4.11 / PX2MM) / 2 + 0.5,
    plainNumbers: true,
    cols: {
      name: (94 + 28) * 0.75,
      nameWidth: (796 - 12 - 122) * 0.75,        // 品名の印字幅。超える場合は横方向に縮小
      qtyRight: (898 - pad) * 0.75,
      qtyWidth: 70,
      unitCenter: (898 + 977) / 2 * 0.75,
      unitWidth: 55,
      priceRight: (1166 - pad) * 0.75,
      priceWidth: (1166 - 977 - pad * 2) * 0.75, // 〜9,999,999。超える場合は横方向に縮小
      amountRight: (1386 - pad) * 0.75,
      amountWidth: (1386 - 1166 - pad * 2) * 0.75,
      remarks: (1386 + 14) * 0.75,
      remarksWidth: (1559 - 8 - 1386 - 14) * 0.75 // 備考の印字幅。超える場合は横方向に縮小
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
    staffStampCenter: STAFF_STAMP_CENTER,
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
    staffStampCenter: shiftPt(STAFF_STAMP_CENTER, -50, 665),
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

// 明細内容は閲覧専用(disabled入力)で描画する
function renderItemsInput() {
  const body = document.getElementById("itemsInputBody");
  body.innerHTML = "";
  items.forEach((item, idx) => {
    const tr = document.createElement("tr");
    const amount = itemAmount(item);
    tr.innerHTML = `
      <td class="col-name"><input type="text" value="${escapeAttr(item.name)}" disabled></td>
      <td class="col-qty"><input type="number" step="any" value="${item.qty}" disabled></td>
      <td class="col-unit"><input type="text" value="${escapeAttr(item.unit)}" disabled></td>
      <td class="col-price"><input type="number" step="0.01" value="${item.price}" disabled></td>
      <td class="col-amount"><span class="item-amount" data-idx="${idx}">${amount ? amount.toLocaleString("ja-JP") : ""}</span></td>
      <td class="col-remarks"><input type="text" value="${escapeAttr(item.remarks)}" disabled></td>
    `;
    body.appendChild(tr);
  });

  const totalTr = document.createElement("tr");
  totalTr.className = "total-row";
  totalTr.innerHTML = `
    <td class="col-name" colspan="3"></td>
    <td class="col-price"><span class="total-label">合計</span></td>
    <td class="col-amount"><span class="item-amount" id="itemsTotalAmount"></span></td>
    <td class="col-remarks"></td>
  `;
  body.appendChild(totalTr);

  updateAmounts();
}

function updateAmounts() {
  let total = 0;
  items.forEach((item) => {
    const amount = itemAmount(item);
    total += amount;
  });
  const totalSpan = document.getElementById("itemsTotalAmount");
  if (totalSpan) totalSpan.textContent = total.toLocaleString("ja-JP");
}

function escapeAttr(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
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

// 役職なし: 苗字を上下に自動分割(例: 山田→上「山」下「田」)
// 役職あり: 上段に苗字、下段に役職(支払伝票PJ版と同じ規則)
// 役職が「支店長」の場合のみ例外: 上段に事業所名(「工事情報」の事業所、末尾の「支店」を除いた文字)、下段に「支店長」
function staffStampNameOptions(sei, title) {
  if (title === "支店長") {
    const officeRaw = getField("branchType") ? getField("branchType").split("|")[0] : "";
    return { nameTop: officeRaw.replace(/支店$/, ""), nameBottom: title };
  }
  return title ? { nameTop: sei, nameBottom: title } : { name: sei };
}

// DateStamp.draw()(支払伝票PJと共通のcommon-libs/date-stamp.js)でcanvasに描画し、
// PNG dataURLとして返す。見た目を支払伝票PJ版の丸型3段デート印と完全に一致させるため、
// CSSで再現せずcanvas描画をそのまま流用する。
function buildStaffStampDataUrl() {
  const sei = getField("staffStampName").trim();
  if (!sei) return null;
  const title = getField("staffStampTitle");
  const color = STAFF_TITLE_DEFAULT_COLOR[title] || "black";
  const radius = 120;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = radius * 2 + 8;
  const ctx = canvas.getContext("2d");
  DateStamp.draw(ctx, canvas.width / 2, canvas.height / 2, {
    ...staffStampNameOptions(sei, title),
    date: getField("staffStampDate") || todayIso(),
    dateFormat: "yy-slash",
    color,
    radius
  });
  return canvas.toDataURL("image/png");
}

function addStaffStamp(layer) {
  const dataUrl = buildStaffStampDataUrl();
  if (!dataUrl) return;
  const img = document.createElement("img");
  img.className = "ov-stamp ov-stamp-readonly";
  img.src = dataUrl;
  const center = layout().staffStampCenter;
  img.style.left   = mm(center.x - STAFF_STAMP_SIZE / 2) + "mm";
  img.style.top    = mm(center.y - STAFF_STAMP_SIZE / 2) + "mm";
  img.style.width  = mm(STAFF_STAMP_SIZE) + "mm";
  img.style.height = mm(STAFF_STAMP_SIZE) + "mm";
  layer.appendChild(img);
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
  buildOverlay(document.getElementById("overlayLayer"), data);
  renderAltPreview();
}

function renderAltPreview() {
  const data = collectFormData();
  const altTheme = data.themeColor === "red" ? "blue" : "red";
  document.getElementById("bgImageAlt").src = bgSrc(altTheme);
  buildOverlay(document.getElementById("overlayLayerAlt"), data);
}

// 業者情報(印影含む)は社員側では編集不可のため、ドラッグ機能は持たない
function buildOverlay(layer, data) {
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
    img.className = "ov-stamp ov-stamp-readonly";
    img.src = s.url;
    img.style.left   = mm(Number(data[s.xf]) || 0) + "mm";
    img.style.top    = mm(Number(data[s.yf]) || 0) + "mm";
    img.style.width  = mm(Number(data[s.sf]) || 110) + "mm";
    img.style.height = mm(Number(data[s.sf]) || 110) + "mm";
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
    const amount = itemAmount(item);
    subtotal += amount;
    if (i >= L.rows && orientation === "portrait") continue; // 縦の帳票は枠外に印字しない(合計には含める)
    const rowY = IL.rowTop + i * IL.rowHeight + IL.textOffset;
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

  const totalRowY = IL.totalRowY !== undefined ? IL.totalRowY : IL.rowTop + L.rows * IL.rowHeight + IL.textOffset;
  addOverlay(layer, IL.cols.name, totalRowY, "合計");
  if (IL.plainNumbers) {
    addOverlayFitRight(layer, IL.cols.amountRight, IL.cols.amountWidth, totalRowY, "¥" + yen(subtotal));
  } else {
    const totalStr = amountFmt(subtotal);
    const totalCharWidth = 26.5; // 概算: グリフ幅+letter-spacing(6.5pt)分
    const totalYenRightX = IL.cols.amountRight - (totalStr.length * totalCharWidth) - 2;
    addOverlayRight(layer, IL.cols.amountRight, IL.cols.amountWidth, totalRowY, totalStr, "ov-amount");
    addOverlayRight(layer, totalYenRightX, 30, totalRowY, "¥", "ov-amount");
  }

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

  addStaffStamp(layer);
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

function buildAttachmentPages(container) {
  container.querySelectorAll(".attachment-page").forEach(el => el.remove());
  attachments.forEach(att => {
    if (!att.type.startsWith("image/")) return; // PDF は印刷対象外
    const page = document.createElement("div");
    page.className = "quote-page attachment-page";
    const img = document.createElement("img");
    img.src = att.dataUrl;
    page.appendChild(img);
    container.appendChild(page);
  });
}

// 添付ファイルは閲覧専用(モーダルでダウンロードせず表示)。削除ボタンは持たない。
function renderAttachmentList() {
  const ul = document.getElementById("attachmentList");
  ul.innerHTML = "";
  if (!attachments.length) {
    const li = document.createElement("li");
    li.className = "attachment-item attachment-empty";
    li.textContent = "添付ファイルはありません。";
    ul.appendChild(li);
    return;
  }
  attachments.forEach((att, idx) => {
    const li = document.createElement("li");
    li.className = "attachment-item";
    const isImage = att.type.startsWith("image/");
    const thumb = isImage
      ? `<img class="attachment-thumb" src="${att.dataUrl}" alt="">`
      : `<span style="font-size:20px;flex-shrink:0">📄</span>`;
    // PDFは見積書本体の印刷(プレビュー)には含まれないため、個別に表示して出力する必要がある旨を明示する
    const pdfNote = !isImage
      ? `<span class="attachment-pdf-note">個別に表示して出力してください</span>`
      : "";
    li.innerHTML = `${thumb}<span class="attachment-name">${att.name}</span>${pdfNote}<button class="btn-view-attachment" data-idx="${idx}">表示</button>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll(".btn-view-attachment").forEach(btn => {
    btn.addEventListener("click", () => viewAttachment(Number(btn.dataset.idx)));
  });
}

// data URLをBlobに変換してobject URL化する。大きめのPDF/画像でもdata URLのまま
// <iframe>/<img>に渡すより表示が安定し、ダウンロードも発生しない。
function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = (header.match(/data:(.*?);base64/) || [, "application/octet-stream"])[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

let currentAttachmentObjectUrl = null;

function viewAttachment(idx) {
  const att = attachments[idx];
  if (!att) return;
  document.getElementById("attachmentViewTitle").textContent = att.name;
  const body = document.getElementById("attachmentViewBody");
  body.innerHTML = "";
  const objectUrl = URL.createObjectURL(dataUrlToBlob(att.dataUrl));
  currentAttachmentObjectUrl = objectUrl;
  if (att.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = objectUrl;
    img.className = "attachment-view-image";
    body.appendChild(img);
  } else {
    // <embed type="application/pdf">はブラウザ内蔵PDFビューアが確実に起動する組み込み方法。
    // 環境によって表示されない場合に備え、同じblob URLを新しいタブで開くリンクも併記する
    // (data URLではなくblob URLなのでダウンロードにはならない)。
    const embed = document.createElement("embed");
    embed.src = objectUrl;
    embed.type = "application/pdf";
    embed.className = "attachment-view-frame";
    body.appendChild(embed);

    const fallback = document.createElement("p");
    fallback.className = "attachment-view-fallback";
    fallback.textContent = "表示されない場合は ";
    const link = document.createElement("a");
    link.href = objectUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "こちらから新しいタブで開く";
    fallback.appendChild(link);
    body.appendChild(fallback);
  }
  document.getElementById("attachmentViewModal").style.display = "flex";
}

function closeAttachmentView() {
  document.getElementById("attachmentViewModal").style.display = "none";
  document.getElementById("attachmentViewBody").innerHTML = "";
  if (currentAttachmentObjectUrl) {
    URL.revokeObjectURL(currentAttachmentObjectUrl);
    currentAttachmentObjectUrl = null;
  }
}

function openPrintPreview() {
  renderPreview();
  const data = collectFormData();
  data.items = items;
  const color = document.getElementById("themeColor").value;
  document.getElementById("previewBgA").src = bgSrc(color);
  document.getElementById("previewBgB").src = bgSrc(color === "blue" ? "red" : "blue");
  buildOverlay(document.getElementById("previewLayerA"), data);
  buildOverlay(document.getElementById("previewLayerB"), data);
  buildAttachmentPages(document.getElementById("previewModal").querySelector(".preview-modal-body"));
  buildAttachmentPages(document.getElementById("printSource"));
  document.getElementById("previewModal").style.display = "flex";
  document.getElementById("previewMailHint").style.display = pendingMailAfterPrint ? "block" : "none";
}

function closePrintPreview() {
  document.getElementById("previewModal").style.display = "none";
}

// 「メール送信」: ブラウザはメールへの自動添付ができないため、PDF保存(印刷実行)後に
// mailto:リンクでOutlook(既定のメールソフト)の新規メール画面を開くところまでを自動化する。
// PDFファイル自体の添付は手動で行ってもらう。
let pendingMailAfterPrint = false;

function buildMailtoUrl() {
  const data = collectFormData();
  const subjectParts = ["見積書確認", data.projectNo, data.projectName].filter(Boolean);
  const subject = subjectParts.join("_");
  const body = "見積書(PDF)を添付しております。ご確認をお願いいたします。\n\n※先ほど保存したPDFファイルをこのメールに添付してください。";
  return "mailto:?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
}

function startMailFlow() {
  pendingMailAfterPrint = true;
  openPrintPreview();
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
  setField("staffStampDate", todayIso()); // 新しいファイルを開いたら確認日は当日にリセット(担当者名は維持)
  renderItemsInput();
  renderAttachmentList();
  renderPreview();
}

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
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

document.addEventListener("DOMContentLoaded", () => {
  writeStampPosFields(layout().stampDefaults);
  applyOrientationView();
  items = Array.from({ length: layout().rows }, emptyItem);
  setField("staffStampDate", todayIso());
  loadStaffStampPref();
  renderItemsInput();
  renderAttachmentList();
  renderPreview();

  document.getElementById("orientation").addEventListener("change", onOrientationChange);
  document.getElementById("btnOpenFile").addEventListener("click", openFromFile);
  document.getElementById("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    applyLoadedData(JSON.parse(text));
    e.target.value = "";
  });

  document.getElementById("btnPrint").addEventListener("click", () => {
    pendingMailAfterPrint = false;
    openPrintPreview();
  });
  document.getElementById("btnMail").addEventListener("click", startMailFlow);
  document.getElementById("btnClosePreview").addEventListener("click", () => {
    pendingMailAfterPrint = false;
    closePrintPreview();
  });
  document.getElementById("btnClosePreview2").addEventListener("click", () => {
    pendingMailAfterPrint = false;
    closePrintPreview();
  });
  document.getElementById("btnPrintFromPreview").addEventListener("click", () => {
    closePrintPreview();
    window.print();
    if (pendingMailAfterPrint) {
      pendingMailAfterPrint = false;
      window.location.href = buildMailtoUrl();
    }
  });

  document.getElementById("btnCloseAttachmentView").addEventListener("click", closeAttachmentView);

  // 工事情報+担当者確認印のみ編集可能。変更のたびにプレビューへ反映する。
  const editableIds = ["branchType", "projectNo", "projectName", "siteLocation", "periodStart", "periodEnd", "staffStampName", "staffStampDate", "staffStampTitle"];
  editableIds.forEach(id => {
    document.getElementById(id).addEventListener("input", renderPreview);
    document.getElementById(id).addEventListener("change", renderPreview);
  });

  // 担当者(苗字)・役職はブラウザに記憶し、次回以降デフォルト表示する(確認日は対象外)。
  ["staffStampName", "staffStampTitle"].forEach(id => {
    document.getElementById(id).addEventListener("input", saveStaffStampPref);
    document.getElementById(id).addEventListener("change", saveStaffStampPref);
  });
});
