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
let a0004 = null; // 業者が取り込んだ見積依頼書(本-購買-A0004)。閲覧・印刷のみ

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
    portraitHeader: true,
    items: PORTRAIT_ITEMS_LAYOUT,
    rows: 15,
    notesMaxLines: 5,
    staffStampCenter: { x: P(12 + 23 * 3 + 11.5), y: P(257 + 11.5) }, // 社内確認用の押印枠(4つ横並び・23mm角)の右端
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

// 明細内容は閲覧専用(disabled入力)で描画する
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
      <td class="col-name"><input type="text" value="${escapeAttr(item.name)}" disabled></td>
      <td class="col-qty"><input type="number" step="any" value="${item.qty}" disabled></td>
      <td class="col-unit"><input type="text" value="${escapeAttr(item.unit)}" disabled></td>
      <td class="col-price"><input type="number" step="0.01" value="${item.price}" disabled></td>
      <td class="col-amount"><span class="item-amount" data-idx="${idx}">${amount ? yen(amount) : ""}</span></td>
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
  if (totalSpan) totalSpan.textContent = yen(total);
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
  const numStr = amountFmt(Math.round(amount || 0)); // マイナスは先頭に▲
  const padded = numStr.padStart(11, " ").slice(-11);
  return padded.split("");
}

function bgSrc(color) {
  return layout().bg[color === "red" ? "red" : "blue"]();
}

// ===== 業者見積日のチェック: 工期(開始)を過ぎた業者見積日は不可(社内ルール。業者用と同じ) =====
// 入力欄の下に警告を出し、日付を変えたときと、プレビュー・メール送信の前に確認する(止めはしない)
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
  buildOverlay(document.getElementById("overlayLayer"), data);
  syncContPages(document.getElementById("printSource"), document.getElementById("printArea"), "A", data.themeColor, data, false);
  renderAltPreview();
}

function renderAltPreview() {
  const data = collectFormData();
  const altTheme = data.themeColor === "red" ? "blue" : "red";
  document.getElementById("bgImageAlt").src = bgSrc(altTheme);
  buildOverlay(document.getElementById("overlayLayerAlt"), data);
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

// 業者情報(印影含む)は社員側では編集不可のため、ドラッグ機能は持たない
function buildOverlay(layer, data) {
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
    img.className = "ov-stamp ov-stamp-readonly";
    img.src = s.url;
    img.style.left   = mm(Number(data[s.xf]) || 0) + "mm";
    img.style.top    = mm(Number(data[s.yf]) || 0) + "mm";
    img.style.width  = mm(Number(data[s.sf]) || 110) + "mm";
    img.style.height = mm(Number(data[s.sf]) || 110) + "mm";
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
  const modalBody = document.getElementById("previewModal").querySelector(".preview-modal-body");
  syncContPages(modalBody, document.getElementById("previewPageA"), "A", color, data, true);
  syncContPages(modalBody, document.getElementById("previewPageB"), "B", color === "blue" ? "red" : "blue", data, true);
  const total = pageCount();
  document.getElementById("previewLabelA").textContent = total > 1 ? `▼ 1部目 1/${total}ページ` : "▼ 1ページ目";
  document.getElementById("previewLabelB").textContent = total > 1 ? `▼ 2部目 1/${total}ページ` : "▼ 2ページ目";
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
  a0004 = data.a0004 && data.a0004.values ? data.a0004 : null;
  extraPages = Number(data.extraPages) || 0;
  items = Array.isArray(data.items) && data.items.length ? trimTrailingEmptyRows(data.items) : [];
  restoreOrientation(data);
  setField("staffStampDate", todayIso()); // 新しいファイルを開いたら確認日は当日にリセット(担当者名は維持)
  renderItemsInput();
  renderAttachmentList();
  renderA0004Status();
  renderPreview();
}

// ===== 見積依頼書(本-購買-A0004): 業者が見積書に取り込んだものを閲覧・印刷する =====
function renderA0004Status() {
  const status = document.getElementById("a0004Status");
  const has = !!(a0004 && a0004.values);
  status.className = "a0004-status" + (has ? "" : " empty");
  status.textContent = has
    ? `見積依頼書あり: ${a0004.code} ${a0004.values.koban || ""} ${a0004.values.gyosha ? "(" + a0004.values.gyosha + " 殿)" : ""}`
    : "見積依頼書は添付されていません";
  document.getElementById("btnViewA0004").disabled = !has;
}

function closeA0004Modal() {
  document.getElementById("a0004Modal").style.display = "none";
  document.getElementById("a0004View").innerHTML = "";
}

function openA0004View() {
  if (!a0004) return;
  A0004.render(document.getElementById("a0004View"), a0004);
  document.getElementById("a0004Modal").style.display = "flex";
}

function todayIso() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// ===== 保存・印刷のファイル名: 「工番_工事名(頭6文字)_業者名_業者見積日(yyyymmdd)」(ユーザー指定) =====
// 印刷(PDFで保存)のときはページ名をこの名前にする(ブラウザがPDFの名前の候補にする)
function fileBaseName() {
  const clean = (s) => String(s || "").replace(/[\\/:*?"<>|\r\n\t]/g, "").replace(/[\s　]+/g, "");
  const projectName = Array.from(clean(getField("projectName"))).slice(0, 6).join("");
  const date = (getField("vendorQuoteDate") || todayIso()).replace(/-/g, "");
  const parts = [clean(getField("projectNo")), projectName, clean(getField("vendorName")), date].filter(Boolean);
  return parts.join("_") || "見積書";
}

function hasQuoteData() {
  return !!(getField("vendorName") || getField("projectNo") || items.some(it => !isEmptyItem(it)));
}

// 修正した内容を見積書JSONとして保存する(業者用の「ファイルに保存」と同じ形式。見積依頼書も含める)
async function saveToFile() {
  if (!hasQuoteData()) { alert("保存する見積書がありません。先に「ファイルを開く」で見積書を読み込んでください。"); return; }
  if (!confirmQuoteDate("保存")) return;
  const data = collectFormData();
  data.items = items;
  data.a0004 = a0004;
  const json = JSON.stringify(data, null, 2);
  const fileName = fileBaseName() + ".json";
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
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
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// プレビューを開かずにそのまま印刷する(印刷の中身はプレビューと同じものを作る)
function printDirect() {
  if (!confirmQuoteDate("印刷")) return;
  pendingMailAfterPrint = false;
  openPrintPreview();
  closePrintPreview();
  window.print();
}

const ORIGINAL_TITLE = document.title;
window.addEventListener("beforeprint", () => {
  const suffix = document.body.classList.contains("print-a0004") ? "_見積依頼書" : "";
  document.title = fileBaseName() + suffix;
});
window.addEventListener("afterprint", () => { document.title = ORIGINAL_TITLE; });

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
  renderA0004Status();
  renderPreview();

  document.getElementById("btnViewA0004").addEventListener("click", openA0004View);
  document.getElementById("btnPrintA0004").addEventListener("click", () => {
    closeA0004Modal();
    A0004.print(a0004);
  });
  ["btnCloseA0004", "btnCloseA0004b"].forEach(id => {
    document.getElementById(id).addEventListener("click", closeA0004Modal);
  });
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
    if (!confirmQuoteDate("プレビュー")) return;
    pendingMailAfterPrint = false;
    openPrintPreview();
  });
  document.getElementById("btnSaveFile").addEventListener("click", saveToFile);
  document.getElementById("btnPrintDirect").addEventListener("click", printDirect);
  document.getElementById("btnMail").addEventListener("click", () => {
    if (confirmQuoteDate("メール送信")) startMailFlow();
  });
  // 業者見積日・工期(開始)を変えて、工期(開始)を過ぎた見積日になったらその場で知らせる
  ["vendorQuoteDate", "periodStart"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      const msg = quoteDateProblem();
      if (msg) alert(msg);
    });
  });
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

  // 工事情報・業者見積日・担当者確認印のみ編集可能。変更のたびにプレビューへ反映する。
  const editableIds = ["branchType", "projectNo", "projectName", "siteLocation", "periodStart", "periodEnd", "vendorQuoteDate", "staffStampName", "staffStampDate", "staffStampTitle"];
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
