// ===== 本-購買-A0004 見積依頼書／注文書付属書(Y-Format で作成したJSON)の取込・閲覧・印刷 =====
// 業者用・社員用の両方で使う。見た目は Y-Format の A0004 の縦(正規版)に合わせた閲覧専用の表示。
// 項目・約款の文言は Y-Format の forms/kobai-a0004.js と同じ(Y-Format側の様式を変えたらここも合わせる)。
//
// 見積書データには、取り込んだ業者1社分だけを a0004 として保存する(他社の業者名・○✕は保存しない):
//   { form, code, title, kind, savedAt, importedAt, fileName, values }  values は1社目のキー(p2. などを外した形)
(function () {
  const SEITEI = "99/01/04";
  const KAITEI = "26/11/17";
  const ISO = "【8.4.3】外部提供者に対する情報";
  const FORMS = {
    "kobai-a0004-1": 1, "kobai-a0004-1-tate": 1,
    "kobai-a0004-2": 2, "kobai-a0004-2-tate": 2,
  };
  const TITLES = {
    1: "見積依頼書／注文書付属書（労務・材料労務）",
    2: "見積依頼書／注文書付属書（物品納品）",
  };

  // ---- 表の行(Y-Format の LEFT/RIGHT/TAIL と同じ) ----
  const LEFT = (kind) => [
    ["工事番号", [{ d: "○", f: "text", key: "koban" }]],
    ["工事名称", [{ d: "○", f: "text", key: "kojiName" }]],
    ["施工場所", [{ d: "○", f: "text", key: "basho" }]],
    ["工事命令書工期", [{ d: "○", f: "range", key: "meirei" }]],
    ...(kind === 1 ? [["工期設定確認", [{ d: "○", f: "kyuko", key: "kyuko", red: true }]]] : []),
    ["見積提出日", [{ d: "○", f: "date", key: "teishutsu" }]],
    ["見積･工事対象", [{ d: "○", f: "text", key: "taisho" }]],
    ["見積書工期", [{ d: "○", f: "range", key: "mitsuKoki" }]],
    ["設計図書\n（仕様書含む）", [{ t: "図面（名称･番号･作成日等）", f: "lines", key: "zumen" }, { t: "仕様書（名称･版番号等）", f: "lines", key: "shiyo" },
      { t: "規格（JIS･JEM等の名称･版番号）", f: "lines", key: "kikaku" }]],
    ["必要とする力量", ["登録電気工事基幹技能者 ⇒「登録電気工事基幹技能者業務注文付属書」を添付すること。", "第1種電気工事士、第2種電気工事士", "工事担任者資格者", "甲種第4類消防設備士"]],
    ["支給品の有無", [{ f: "text", key: "shikyu" }]],
    ["運　搬", ["荷揚（荷揚用機器への積込、積降ろし手間）", "荷揚用機器（組立･解体･損料･使用料･オペレータ費用）", "材料等の場内水平小運搬", "材料等の現場搬入", "支給材の小運搬", "貸与機械の有資格者の配置"]],
    ["足　場", ["脚立･足場板の組立、解体、移動、損料", "ローリングタワーの移動（小規模）", "ローリングタワーの移動（大規模）", "足場等の盛替", "高所作業車", "ゴンドラの揚重･取付･盛替作業"]],
    ["墨出し", ["基準墨", "配管･配線墨", "天井器具類墨"]],
    ["養　生", ["取付中の養生", "取付完了後の養生"]],
    ["片　付", ["建設廃棄物の場外搬出･処分に係る費用", "梱包材･発生材の場内指定場所への集積", { t: "作業終了後の片付･清掃", d: "○" }]],
  ];
  const RIGHT = (kind) => [
    ["機　器", [{ t: "協力会社先での検証", f: "kensa", key: "kensa" }]],
    ["図面･書類", ["工種別施工計画書（施工要領書）･施工図･製作図", "竣工（完成）図書一式"]],
    ["見　本", [{ f: "text", key: "mihon" }]],
    ["検査･確認", ["諸官庁･施主･設計監理者の諸検査の立会い", "使用機器の性能試験･検査（成績書提出）"]],
    ["安全衛生", ["保安･警備費（入退場管理を含む）", "現場安全衛生管理用施設の確保及び維持管理", "仮設道路･通路の確保及び維持管理", "労災保険料、第三者傷害賠償保険料",
      "安全パトロール", "揚重の合図･玉掛け", "再下請負通知書･作業員名簿等の提出"]],
    ["支払条件", [{ t: "労務業者\n　10日締め　月末支払　現金100％\n主要資器材・資材業者\n　25日締め　翌月末支払　手形60日", d: "○" },
      { t: "振込手数料、駐車場代、安全帽代、工具類貸出費の他、発注者が立替えた費用は、支払時に支払代金より差引いたします。", d: "○" }]],
    ["その他", ["現場事務所、作業用詰所、倉庫等の仮設建物", "電灯電力設備、給排水･トイレ設備、仮設動力設備", "同上用用水光熱費", "工事用電力･用水費", "近隣対策費", "式典費",
      "工事用仮設電源設備工事費", "電力用工事負担金", "受電後の基本料金（引渡日迄）", "受電後の電気使用料（引渡日迄）",
      { t: "社会保険加入、法定福利費（事業主負担分）を内訳明示した見積書", d: kind === 1 ? "○" : "✕" }]],
  ];
  const TAIL = (kind) => [
    ...(kind === 1 ? [{ t: "工事契約時は工事下請負契約約款参照", d: "○" }] : []),
    { t: "契約前「おそれ情報」通知書確認保存", d: "○", red: true },
    { f: "text", key: "free1" },
  ];
  const NOTES = [
    "○：見積･契約に含む･条件内、✕：見積･契約に含まない･条件外",
    "1.　見積依頼時に、工事内容に含める場合は○、含めない場合は✕を記入して協力会社に交付する。",
    "2.　協力会社は、見積書提出時に本書を添付して提出する。",
    "3.　注文書発行時に、本書を添付して発行する。",
  ];

  // ---- 裏面の約款(Y-Format の TERMS と同じ) ----
  const TERMS = {
    1: ["見積依頼書付属書類", [
      "［１］（材料管理）工事用材料・消耗品のうち下請負人が調達するものについては、元請負人の指示または承認を得なければならない。下請負人が万一不適格品を使用した場合は、元請負人は下請負人の負担において交換を命ずることができる。",
      "②下請負人は、元請負人から支給を受けた材料（発注者からの支給品を含む。）をその責任において保管し、下請負人の責に帰すべき理由による損耗・破損・紛失等の事実があったときは、下請負人は直ちにその損害を元請負人に賠償する。",
      "③元請負人から下請負人への支給材料および貸与品については、注文書付属書の記載による。",
      "［２］（不適合施工の改造）下請負人は、工事の施工が関係図書に適合しない場合において、元請負人の監督者がその改造を請求したときは、これに従う。",
      "②前項の不適合が元請負人の責に帰すべき理由によるときは、改造に要する費用は元請負人が負担する。ただし、その改造が軽微な場合は下請負人の負担とする。",
      "［３］（損害）工事目的物の引き渡し前に、工事目的物または工事資材その他工事の施工について生じた損害は、下請負人の負担とする。ただし、その損害のうち、元請負人の責に帰すべき事由により生じたものについては、元請負人がこれを負担する。",
      "②下請負人または再下請負人、現場員等が、工事の施工にあたり第三者（工事に関係する他の工事の請負人等を含む。以下本条において同じ。）に損害を及ぼしたときは、下請負人がその損害を負担する。ただし、その損害のうち、元請負人の責に帰すべき事由により生じたもの、および工事の施工に伴い通常避けることができない事由により生じたものについては、この限りでない。",
      "③天災その他不可抗力によって、工事の出来形部分、現場の工事仮設物、現場搬入済みの工事資材または機械器具（いずれも元請負人が確認したものに限る。）に損害を生じたときは、元請負人がこれを負担する。ただし、下請負人が善良な管理者の注意を怠ったことにより生じた損害は、下請負人の負担とする。",
      "［４］（完成検査および引渡し）下請負人は、工事を完成したときは、元請負人に通知し、元請負人は下請負人の立会のもとに遅滞なく確認検査を行う。",
      "②前項の検査に合格しないときは、下請負人は遅滞なくこれを補修して元請負人の検査を受ける。",
      "③下請負人は、完成検査に合格したときは、元請負人の指示に従ってすみやかに残材の処置・後片付け・清掃等を行い、直ちに工事目的物を元請負人に引き渡すものとする。",
      "［５］（請負代金の支払い）工事出来形の検収は、原則として月一回とし、下請負人は元請負人の定めた期日までに請求書を元請負人に提出する。",
      "②元請負人は、下請負人の請求金額のうち下請負人の施工が完全であると認定した部分につき、元請負人の定める支払日に下請負人に支払う。",
      "③元請負人が、下請負人に対して前払金、立替金、有償支給品代、弁償金等の債権を有するときは、元請負人は、それらの債権を下請負人に対する支払代金と相殺することができる。",
      "［６］（工事の変更及び中止等）元請負人は、必要があると認めるときは、書面をもって下請負人に通知し、工事内容を変更し、又は工事の全部若しくは一部の施工を一時中止させることができる。この場合において、必要があると認められるときは、元請負人と下請負人とが協議して、工期又は請負代金額を変更する。",
      "②工事用地等の確保ができない等のため、又は天災その他の不可抗力により工事目的物等に損害を生じ、若しくは工事現場の状態が変動したため、下請負人が工事を施工できないと認められるときは、元請負人は、工事の全部又は一部の施工を中止させる。この場合において、必要があると認められるときは、元請負人と下請負人とが協議して、工期又は請負代金額を変更する。",
      "③元請負人は、前2項の場合において、下請負人が工事の続行に備え工事現場を維持し、若しくは作業員、建設機械器具等を保持するための費用、その他の工事の施工の一時中止に伴う増加費用を必要とし、又は下請負人に損害を及ぼしたときは、その増加費用を負担し、又はその損害を賠償する。この場合おける負担額又は賠償額は、元請負人と下請負人とが協議して定める。",
      "［７］（下請負人の請求による工期の延長）下請負人は、天候の不良等その責めに帰することができない理由、その他の正当な理由により工期内に工事を完成することができないときは、元請負人に対して、遅滞なくその理由を明らかにした書面をもって工期の延長を求めることができる。この場合における延長日数は、元請負人と下請負人とが協議して決める。",
      "②前項の規定により工期を延長する場合において、必要があると認められるときは、元請負人と下請負人とが協議して請負代金額を変更する。",
      "［８］（元請負人の請求による工期の短縮等）元請負人は、特別の理由により工期を短縮する必要があるときは、下請負人に対して、書面をもって工期の短縮を求めることができる。この場合における短縮日数は、元請負人と下請負人とが協議して定める。",
      "②この約款の他の条項の規定により工期を延長すべき場合において、特別の理由があるときは、元請負人と下請負人とが協議の上通常必要とされる工期の延長を行わないことができる。",
      "③前2項の場合において、必要があると認められるときは、元請負人と下請負人とが協議して請負代金額を変更する。",
      "［９］（請負代金の変更）工期内に賃金または物価の変動により、請負代金が不適当となり、これを変更する必要があると認められるときは、元請負人と下請負人とが協議して請負代金を変更することができる。",
      "②元請負人と注文者との間の請負契約において、この工事を含む元請工事の部分について、賃金、または物価の変動を理由に請負代金が変更されたときは、元請負人または下請負人は、相手方に対し、前項の協議を求めることができる。",
      "［１０］（履行遅滞の場合における損害金）下請負人の責に帰すべき事由により工期内に工事を完成することができない場合において、工期経過後相当の期間内に完成する見込みがあるときは、元請負人は、元請負人と下請負人とが協議のうえ損害金を下請負人から徴収して工期を延期することができる。",
      "②元請負人の責に帰すべき理由により、請負代金の支払いが遅れた場合においては、下請負人は未受領金額につき、遅延日数に応じた遅延損害金の支払いを元請負人と下請負人とが協議のうえ、元請負人に請求することができる。",
      "［１１］（紛争の解決）この約款の各条項において元請負人と下請負人とが協議して定めるものにつき協議が整わない場合その他この契約に関して元請負人と下請負人との間に紛争を生じた場合には、建設業法による建設工事紛争審査会（以下「審査会」という。）のあっせんまたは調停により解決を図る。",
      "②元請負人または下請負人は、前項のあっせんまたは調停により紛争を解決する見込みがないと認めたときは、同項の規定にかかわらず、仲裁合意書に基づき、審査会の仲裁に付し、その仲裁判断に服する。",
    ]],
    2: ["物品売買契約約款", [
      "［１］（総則）株式会社雄電社（以下「当社」という｡）と物品納入業者（以下「納入業者」という｡）は､物品の売買に関し、当社・納入業者の合意に基づいて成立した契約条件を誠実に履行する。",
      "［２］（物品の納入）納入業者は、注文書記載の諸条項並びにこの契約約款に基づいて物品を納入しなければならない。",
      "［３］（物品の納期）納入業者は、契約納期を厳守するとともに、当社が請負工事の工程上、物品の分納または納期の変更を指示したときは、これに従うものとする。",
      "［４］（不適合物品の措置）納入業者は、物品の納入に当っては、当社の検収を受けるものとし、納入物品が不足、不良、破損または注文条件と相違しているときは、直ちに納入業者の負担で補充しまたは取り替えをしなければならない。",
      "［５］（納期遅延等）納入業者は、物品の納入が指定納期に遅延する恐れがあるときは、直ちにその理由および納入予定日等を当社に申し出て、当社の指示を受けなければならない。",
      "［６］（物品代金の支払い）当社は、検収、受け渡しを終了した物品の代金を、注文書、注文請書の定めるところにより、納入業者に支払うものとする。",
      "② 当社が納入業者に対して前払金、立替金、有償支給品代、賠償金等の債権を有するときは、当社は、それらの債権を納入業者に対する支払代金と相殺することができる。",
      "［７］（所有権の移転）納入業者は、検収、受け渡しの終了した物品の所有権が、その都度当社に移転することを承認するものとする。",
      "［８］（危険負担）所有権の移転前に生じた納入物品の滅失、毀損、減量、変質その他一切の損害は､当社の責に帰すべきものを除き、納入業者の負担とする。",
      "［９］（権利義務の譲渡禁止）当社または納入業者は、この契約によって生ずる権利または義務を第三者に譲渡し、または承継させてはならない。ただし、相手方の書面による承諾を得た場合はこの限りでない。",
      "［１０］（契約の解除）納入業者がこの契約に違反し、または正当な理由がなく、納期内に物品の納入を履行する見込みがないと当社が認めたときは、当社はこの契約を解除することができるものとする。この場合、納入業者は、当社が被った損害のすべてを賠償しなければならない。",
      "［１１］（補則）注文書、注文請書並びにこの約款に定めのない事項については、当社・納入業者協議して決める。",
      "［１２］（秘密の保持）納入業者は、本契約の履行に当たり知り得た発注者及び元請負人の工法、技術、営業等に関する企業情報の一切を、本契約期間中はもちろん、契約期間終了後といえども第三者に漏えいしてはならない。",
      "② 納入業者は、情報漏えいが発生した場合、または、そのおそれが生じた場合、速やかに元請負人に報告するとともに、被害を抑制するための適切な措置を講じる。",
      "③ 納入業者は、納入業者の責めに帰すべき事由により情報を漏えいした場合には、発注者及び元請負人に生じた損害を賠償する。",
    ]],
  };

  // ---- 読み込み(Y-Format の保存ファイル { form, code, title, savedAt, values }) ----
  // 現場で共通の項目は全業者で同じキー。それ以外は1社目がそのまま、2社目からは「p2.」などが付く(Y-Format と同じ)
  const COMMON = ["koban", "kojiName", "basho", "meirei", "meireiTo", "kyuko", "kyukoFree"];

  function parse(text) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw new Error("JSONファイルとして読み込めませんでした。"); }
    if (doc && Array.isArray(doc.items) && "projectNo" in doc) throw new Error("見積書のデータファイルです。見積書は「ファイルを開く」から読み込んでください。");
    const kind = doc && FORMS[doc.form];
    if (!kind || !doc.values || typeof doc.values !== "object") {
      throw new Error("本-購買-A0004 見積依頼書／注文書付属書(Y-Formatで保存したJSON)ではありません。"
        + (doc && doc.code ? `\n(このファイルの帳票: ${doc.code} ${doc.title || ""})` : ""));
    }
    const v = doc.values;
    const count = Math.max(1, Number(v.pageCount) || 1);
    const vendors = Array.from({ length: count }, (_, i) => ({ n: i + 1, name: String(v[i === 0 ? "gyosha" : `p${i + 1}.gyosha`] || "") }));
    return { doc, kind, vendors };
  }

  // n 社目の分だけを取り出して1社目のキーにする
  function extract(parsed, n, fileName) {
    const src = parsed.doc.values, values = {};
    Object.keys(src).forEach((key) => {
      if (key === "pageCount") return;
      if (COMMON.includes(key)) { values[key] = src[key]; return; }
      const m = key.match(/^p(\d+)\.(.*)$/);
      if (m) { if (Number(m[1]) === n) values[m[2]] = src[key]; return; }
      if (n === 1) values[key] = src[key];
    });
    return {
      form: parsed.doc.form, code: parsed.doc.code || `本-購買-A0004-${parsed.kind}`, title: TITLES[parsed.kind], kind: parsed.kind,
      savedAt: parsed.doc.savedAt || "", importedAt: new Date().toISOString(), fileName: fileName || "", values,
    };
  }

  // ---- 表示 ----
  const h = (tag, cls, ...kids) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    kids.flat().forEach((k) => { if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k))); });
    return el;
  };
  const lines = (s) => String(s).split("\n").flatMap((x, i) => (i ? [h("br"), x] : [x]));
  const jpDate = (iso) => {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${Number(m[1])}年 ${Number(m[2])}月 ${Number(m[3])}日` : "　　　年　　月　　日";
  };

  function table(groups, tail, kind, v) {
    const mark = (key, d) => h("td", "a4f-m", v[key] === undefined ? (d || "") : v[key]);
    const val = (key) => String(v[key] == null ? "" : v[key]);
    const body = (it) => {
      if (typeof it === "string") it = { t: it };
      const cls = "a4f-txt" + (it.red ? " red" : "");
      switch (it.f) {
        case "text": return h("td", "a4f-in", val(it.key));
        case "date": return h("td", "a4f-in a4f-date", jpDate(v[it.key]));
        case "range": return h("td", "a4f-in a4f-range", h("span", null, jpDate(v[it.key])), h("span", null, "～"), h("span", null, jpDate(v[it.key + "To"])));
        case "lines": return h("td", cls + " a4f-lines", h("div", "a4f-lt", it.t), h("div", "a4f-lv", val(it.key)));
        case "kyuko": {
          const box = (on, label) => h("span", "a4f-chk", h("span", "a4f-box" + (on ? " on" : "")), label);
          const sel = val(it.key);
          return h("td", cls, h("div", "a4f-inline", "工期設定チェックリスト添付／休工日：",
            h("span", "a4f-checks", box(sel === "4週8休", "4週8休"), box(sel === "4週8閉所", "4週8閉所"), box(sel === "その他", "")),
            "（", h("span", "a4f-kv", val("kyukoFree")), "）"));
        }
        case "kensa": return h("td", cls + " a4f-kensa", h("div", null, it.t),
          ...[["検査者", "kensasha"], ["検査日", "kensabi"], ["検査基準", "kijun"], ["出荷許可の方法", "shukka"]].map(([l, k]) =>
            h("div", "a4f-inline", h("span", "a4f-sub", l + "："), h("span", "a4f-kv" + (k === "kensabi" ? " a4f-date" : ""),
              k === "kensabi" ? jpDate(v[`${it.key}.${k}`]) : val(`${it.key}.${k}`)))));
        default: return h("td", cls, ...lines(it.t));
      }
    };
    const tb = h("tbody", null, h("tr", null, h("th", null, "項　目"), h("th", "a4f-mh", "○✕"), h("th", null, "摘　　　　要")));
    groups.forEach(([label, items], g) => items.forEach((it, i) => {
      const key = (typeof it === "object" && it.key) ? `m.${it.key}` : `m.${kind}.${label}.${i}`;
      const extra = tail && g === groups.length - 1 ? 2 + tail.length : 0;
      const tr = h("tr", i === 0 ? "a4f-grp" : null);
      if (i === 0) { const th = h("th", "a4f-lbl", ...lines(label)); th.rowSpan = items.length + extra; tr.append(th); }
      tr.append(mark(key, typeof it === "object" ? it.d : ""), body(it));
      tb.append(tr);
    }));
    if (tail) {
      tb.append(
        h("tr", null, mark("m.maker", ""), h("td", "a4f-txt", "下請等指定メーカの有無")),
        h("tr", null, mark("m.gyosha", ""), h("td", "a4f-txt", "下請等指定業者の有無")),
        ...tail.map((it, i) => h("tr", null, mark(`m.tail${i}`, it.d), body(it))));
    }
    const t = h("table", "a4f-grid a4f-b4" + (tail ? " a4f-right" : ""));
    const cg = h("colgroup");
    ["16mm", "5.5mm", null].forEach((w) => { const c = h("col"); if (w) c.style.width = w; cg.append(c); });
    t.append(cg, tb);
    return t;
  }

  function header(a, subtitle, withStamps) {
    const v = a.values;
    const left = h("div", "a4f-head-left",
      h("div", "a4f-code", a.code, h("span", "a4f-iso", ISO)),
      h("div", "a4f-title", a.title, h("span", "a4f-sub", subtitle)));
    if (withStamps) {
      const vt = h("table", "a4f-grid a4f-vendor");
      const tr = h("tr", null, h("th", null, "業 者 名"), h("td", "a4f-vname", String(v.gyosha || "")), h("td", "a4f-dono", "殿"));
      vt.append(h("tbody", null, tr));
      left.append(h("div", "a4f-head-blocks", vt));
    }
    const head = h("div", "a4f-header", left);
    if (withStamps) {
      const stampBox = (label) => h("div", "a4f-stamp-box",
        h("div", "a4f-sb-label", label),
        h("div", "a4f-sb-date", String(v[`sdate.${label}`] || "") || "/　　/"),
        h("div", "a4f-sb-area", h("div", "a4f-sb-roles", "発行")));
      head.append(h("div", "a4f-stamps", h("div", "a4f-stamp-group", stampBox("注文書付属書"), stampBox("見積依頼書"))));
    }
    return head;
  }

  function footer(a) {
    const word = document.getElementById("a0004WordSrc");
    const mark = document.getElementById("a0004MarkSrc");
    const brand = h("div", "a4f-brand");
    if (mark && mark.src) { const i = h("img", "a4f-mark"); i.src = mark.src; i.alt = ""; brand.append(i); }
    if (word && word.src) { const i = h("img", "a4f-word"); i.src = word.src; i.alt = "YUDENSHA"; brand.append(i); }
    return h("div", "a4f-footer", brand, h("div", "a4f-ver", `${a.code}　${a.title}　　${SEITEI}制定　　${KAITEI}最終改訂`));
  }

  // 表面・裏面の2枚(.a4f-sheet)を container に入れる
  function render(container, a) {
    container.innerHTML = "";
    if (!a || !a.values) return;
    const kind = a.kind || FORMS[a.form] || 1;
    const front = h("div", "a4f-sheet",
      header(a, "（表面）", true),
      h("div", "a4f-body", h("div", "a4f-row",
        h("div", "a4f-colwrap", table(LEFT(kind), null, kind, a.values)),
        h("div", "a4f-colwrap a4f-col", table(RIGHT(kind), TAIL(kind), kind, a.values),
          h("ul", "a4f-notes", NOTES.map((t) => h("li", null, t)))))),
      footer(a));
    const back = h("div", "a4f-sheet",
      header(a, "（裏面）", false),
      h("div", "a4f-body", h("div", "a4f-terms",
        h("div", "a4f-terms-title", TERMS[kind][0]),
        TERMS[kind][1].map((p) => h("p", /^［/.test(p) ? "art" : "sub", p)),
        h("p", "a4f-ijo", "以　上"))),
      footer(a));
    container.append(front, back);
  }

  // ---- 印刷: A0004 の2枚だけを A4縦で印刷する ----
  function print(a) {
    const area = document.getElementById("a0004Print");
    render(area, a);
    let style = document.getElementById("a0004PageStyle");
    if (!style) { style = document.createElement("style"); style.id = "a0004PageStyle"; document.head.appendChild(style); }
    // 見積書の @page(向きで切り替わる)より後に置いて A4縦にする
    style.textContent = "@media print { @page { size: A4 portrait; margin: 0; } }";
    document.body.classList.add("print-a0004");
    const done = () => {
      document.body.classList.remove("print-a0004");
      style.textContent = "";
      area.innerHTML = "";
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  }

  window.A0004 = { parse, extract, render, print, TITLES };
})();
