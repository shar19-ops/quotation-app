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

const DEFAULT_ROWS = 9;

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

let items = [];

function emptyItem() {
  return { name: "", qty: "", unit: "", price: "", remarks: "" };
}

function isEmptyItem(item) {
  return !item.name && !item.qty && !item.unit && !item.price && !item.remarks;
}

function trimTrailingEmptyRows(arr) {
  const result = arr.slice();
  while (result.length > DEFAULT_ROWS && isEmptyItem(result[result.length - 1])) {
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
    const amount = (item.qty || 0) * (item.price || 0);
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
    const amount = (item.qty || 0) * (item.price || 0);
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

function setField(id, value) {
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
  img.style.left   = mm(STAFF_STAMP_CENTER.x - STAFF_STAMP_SIZE / 2) + "mm";
  img.style.top    = mm(STAFF_STAMP_CENTER.y - STAFF_STAMP_SIZE / 2) + "mm";
  img.style.width  = mm(STAFF_STAMP_SIZE) + "mm";
  img.style.height = mm(STAFF_STAMP_SIZE) + "mm";
  layer.appendChild(img);
}

function digitGridDigits(amount) {
  const numStr = String(Math.max(0, Math.round(amount || 0)));
  const padded = numStr.padStart(11, " ").slice(-11);
  return padded.split("");
}

function renderPreview() {
  const data = collectFormData();
  document.getElementById("bgImage").src = data.themeColor === "red" ? BG_RED_SRC() : BG_BLUE_SRC();
  buildOverlay(document.getElementById("overlayLayer"), data);
  renderAltPreview();
}

function renderAltPreview() {
  const data = collectFormData();
  const altTheme = data.themeColor === "red" ? "blue" : "red";
  document.getElementById("bgImageAlt").src = altTheme === "red" ? BG_RED_SRC() : BG_BLUE_SRC();
  buildOverlay(document.getElementById("overlayLayerAlt"), data);
}

// 業者情報(印影含む)は社員側では編集不可のため、ドラッグ機能は持たない
function buildOverlay(layer, data) {
  layer.innerHTML = "";

  const qd = splitDate(data.vendorQuoteDate);
  addOverlay(layer, COORDS.vendorQuoteDate_y.x, COORDS.vendorQuoteDate_y.y, qd.y);
  addOverlay(layer, COORDS.vendorQuoteDate_m.x, COORDS.vendorQuoteDate_m.y, qd.m);
  addOverlay(layer, COORDS.vendorQuoteDate_d.x, COORDS.vendorQuoteDate_d.y, qd.d);
  addOverlayCenter(layer, COORDS.vendorQuoteNoCenter, 160, COORDS.vendorQuoteNo.y, data.vendorQuoteNo);

  const [branchName, branchCode] = data.branchType ? data.branchType.split("|") : ["", ""];
  addOverlay(layer, COORDS.branchCode.x, COORDS.branchCode.y, branchCode || "");
  addOverlay(layer, COORDS.branchName.x, COORDS.branchName.y, branchName || "");

  addOverlay(layer, COORDS.projectNo.x, COORDS.projectNo.y, data.projectNo);
  addOverlay(layer, COORDS.projectName.x, COORDS.projectName.y, data.projectName);
  addOverlay(layer, COORDS.siteLocation.x, COORDS.siteLocation.y, data.siteLocation);

  const ps = splitDate(data.periodStart);
  const pe = splitDate(data.periodEnd);
  addOverlay(layer, COORDS.period_y1.x, COORDS.period_y1.y, ps.y);
  addOverlay(layer, COORDS.period_m1.x, COORDS.period_m1.y, ps.m);
  addOverlay(layer, COORDS.period_d1.x, COORDS.period_d1.y, ps.d);
  addOverlay(layer, COORDS.period_y2.x, COORDS.period_y2.y, pe.y);
  addOverlay(layer, COORDS.period_m2.x, COORDS.period_m2.y, pe.m);
  addOverlay(layer, COORDS.period_d2.x, COORDS.period_d2.y, pe.d);

  addOverlay(layer, COORDS.validDays.x, COORDS.validDays.y, data.validDays);

  addOverlay(layer, COORDS.vendorAddress.x, COORDS.vendorAddress.y, data.vendorAddress);
  addOverlay(layer, COORDS.vendorName.x, COORDS.vendorName.y, data.vendorName);
  addOverlay(layer, COORDS.vendorTel.x, COORDS.vendorTel.y, data.vendorTel);
  addOverlayCenter(layer, COORDS.vendorCodeCenter, COORDS.vendorCodeWidth, COORDS.vendorCode.y, data.vendorCode);

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

  addOverlay(layer, COORDS.welfareCost.x, COORDS.welfareCost.y, data.welfareCost ? yen(data.welfareCost) : "");

  if (data.notes) {
    const span = document.createElement("span");
    span.className = "ov ov-notes";
    span.style.left = mm(COORDS.notes.x) + "mm";
    span.style.top = mm(COORDS.notes.y) + "mm";
    span.textContent = data.notes;
    layer.appendChild(span);
  }

  let subtotal = 0;
  const rowCount = Math.max(items.length, DEFAULT_ROWS);
  for (let i = 0; i < rowCount; i++) {
    const item = items[i] || emptyItem();
    const amount = (item.qty || 0) * (item.price || 0);
    subtotal += amount;
    const rowY = ITEMS_LAYOUT.rowTop + i * ITEMS_LAYOUT.rowHeight + 9;
    addOverlay(layer, ITEMS_LAYOUT.cols.name, rowY, item.name);
    addOverlayRight(layer, ITEMS_LAYOUT.cols.qtyRight, ITEMS_LAYOUT.cols.qtyWidth, rowY, item.qty);
    addOverlayCenter(layer, ITEMS_LAYOUT.cols.unitCenter, ITEMS_LAYOUT.cols.unitWidth, rowY, item.unit);
    if (Number(item.qty) !== 1) {
      addOverlayRight(layer, ITEMS_LAYOUT.cols.priceRight, ITEMS_LAYOUT.cols.priceWidth, rowY, priceFmt(item.price), "ov-price");
    }
    addOverlayRight(layer, ITEMS_LAYOUT.cols.amountRight, ITEMS_LAYOUT.cols.amountWidth, rowY, amount ? amountFmt(amount) : "", "ov-amount");
    addOverlay(layer, ITEMS_LAYOUT.cols.remarks, rowY, item.remarks);
  }

  const totalRowY = 1039;
  addOverlay(layer, ITEMS_LAYOUT.cols.name, totalRowY, "合計");
  const totalStr = amountFmt(subtotal);
  const totalCharWidth = 26.5;
  const totalYenRightX = ITEMS_LAYOUT.cols.amountRight - (totalStr.length * totalCharWidth) - 2;
  addOverlayRight(layer, ITEMS_LAYOUT.cols.amountRight, ITEMS_LAYOUT.cols.amountWidth, totalRowY, totalStr, "ov-amount");
  addOverlayRight(layer, totalYenRightX, 30, totalRowY, "¥", "ov-amount");

  const digits = digitGridDigits(subtotal);
  const firstDigitIndex = digits.findIndex(ch => ch.trim() !== "");
  const yenRightX = (firstDigitIndex === -1 ? DIGIT_GRID.x0 + DIGIT_GRID.colWidth * (digits.length - 1) : DIGIT_GRID.x0 + firstDigitIndex * DIGIT_GRID.colWidth) - 4;
  addOverlayRight(layer, yenRightX, DIGIT_GRID.colWidth, DIGIT_GRID.y, "¥", "ov-digit");

  digits.forEach((ch, i) => {
    if (ch.trim() === "") return;
    const x = DIGIT_GRID.x0 + i * DIGIT_GRID.colWidth;
    const span = document.createElement("span");
    span.className = "ov ov-digit";
    span.style.left = mm(x) + "mm";
    span.style.top = mm(DIGIT_GRID.y) + "mm";
    span.style.width = mm(DIGIT_GRID.colWidth) + "mm";
    span.textContent = ch;
    layer.appendChild(span);
  });

  addStaffStamp(layer);
}

function collectFormData() {
  const data = {};
  fieldIds.forEach(id => {
    data[id] = getField(id);
  });
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
  document.getElementById("previewBgA").src = color === "blue" ? BG_BLUE_SRC() : BG_RED_SRC();
  document.getElementById("previewBgB").src = color === "blue" ? BG_RED_SRC()  : BG_BLUE_SRC();
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
  items = Array.isArray(data.items) && data.items.length ? trimTrailingEmptyRows(data.items) : Array.from({ length: DEFAULT_ROWS }, emptyItem);
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
  items = Array.from({ length: DEFAULT_ROWS }, emptyItem);
  setField("staffStampDate", todayIso());
  loadStaffStampPref();
  renderItemsInput();
  renderAttachmentList();
  renderPreview();

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
  const editableIds = ["branchType", "projectNo", "projectName", "siteLocation", "periodStart", "periodEnd", "validDays", "staffStampName", "staffStampDate", "staffStampTitle"];
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
