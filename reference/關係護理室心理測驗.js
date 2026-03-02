const UCACHE_TTL_SHORT = 600;   // 10 分鐘
const UCACHE_TTL_MED   = 1800;  // 30 分鐘
const SCACHE_TTL_LONG  = 21600; // 6 小時（內容表）
const SCACHE_TTL_VLONG = 86400; // 24 小時
const LOADING_EMPHASIS = '⚠️ 資料庫龐大\n⏳ 點按後請稍等幾秒';

/** ====== 🔥 On-Demand 熱啟動（點了才暖、集中管理） ====== */
const HOT_LIGHT_MIN_GAP_SEC = 20 * 60;     // 輕量暖機最短間隔：20 分鐘
const HOT_HEAVY_MIN_GAP_SEC = 6 * 60 * 60; // 重暖最短間隔：6 小時
/** ====== course_level 即時同步（新增）====== */
const COURSE_LEVEL_HEADERS = ['course_level','courseLevel','課程等級','課程級別','課程level'];

/** ================== FAST UI SWITCH (新增) ================== **/
function useFastUi_(){
  // Script Properties: FAST_UI = '1' or '0'
  try {
    const v = PropertiesService.getScriptProperties().getProperty('FAST_UI');
    if (v === '0') return false;
    if (v === '1') return true;
  } catch(_){}
  // 預設開啟：入口體感優先
  return true;
}

/** ScriptCache JSON 快取（跨執行保留） */
function cacheJsonBuild_(cache, key, ttlSec, builderFn){
  if (!cache) return builderFn();
  try {
    const hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch(_){}
  const obj = builderFn();
  try { cache.put(key, JSON.stringify(obj), Math.max(60, ttlSec || 600)); } catch(_){}
  return obj;
}

/** Template Buttons：比 Flex 小很多、渲染更快（入口用） */
function buildBirthdayButtonsPrompt_({ header, manualMsg, initial, min, max }){
  const softWait = '資料量較大，載入約 2–3 秒';
  const text = `${header}\n${softWait}\n（可手動輸入或快速選單）`;

  return {
    type: 'template',
    altText: header,
    template: {
      type: 'buttons',
      text: text.slice(0, 160), // LINE buttons text 長度限制保險
      actions: [
        {
          type: 'datetimepicker',
          label: '快速選單',
          data: 'action=birthday_quick',
          mode: 'date',
          initial, min, max
        },
        {
          type: 'message',
          label: '手動輸入生日',
          text: manualMsg
        }
      ]
    }
  };
}

/** 通用：更新 idx:* 的 ScriptCache（給 A/B 欄索引用） */
function updateIndexCache_(sheetName, colLetter, keyValue, rowNum){
  const sc = CacheService.getScriptCache();
  const CK = `idx:${sheetName}:${String(colLetter||'').toUpperCase()}`;
  const cur = _getJson(sc, CK) || {};
  cur[normalizeKey(keyValue)] = rowNum;
  _putJson(sc, CK, cur, SCACHE_TTL_LONG);
}

/** ================== DAILY WARMUP (新增/可選) ================== **/
function installDailyWarmup_(){
  // 先刪同名 trigger，避免重覆
  const name = 'hot_dailyWarmLight';
  const name2 = 'hot_dailyWarmHeavy';
  ScriptApp.getProjectTriggers().forEach(t=>{
    const fn = t.getHandlerFunction && t.getHandlerFunction();
    if (fn === name || fn === name2) ScriptApp.deleteTrigger(t);
  });

  // 每天 07:30 跑輕量（建議：上課前）
  ScriptApp.newTrigger(name).timeBased().everyDays(1).atHour(7).nearMinute(30).create();

  // 每天 08:00 跑重暖（可選；你若怕耗時就先關掉這行）
  ScriptApp.newTrigger(name2).timeBased().everyDays(1).atHour(8).nearMinute(0).create();

  return 'OK';
}

function hot_dailyWarmLight(){
  try { hot_warmLight(); } catch(e){ Logger.log('hot_dailyWarmLight err:'+e); }
}

function hot_dailyWarmHeavy(){
  try { hot_warmHeavy(); } catch(e){ Logger.log('hot_dailyWarmHeavy err:'+e); }
}

function _courseLevelCol1_(){
  const sc = CacheService.getScriptCache();
  const ck = 'col:會員清單:course_level';
  const hit = sc.get(ck);
  if (hit) return parseInt(hit, 10) || 0;

  const hdr = (headersCached('會員清單', SCACHE_TTL_LONG).headers || []).map(String);
  const idx0 = _colIndexByHeader(hdr, COURSE_LEVEL_HEADERS);
  const col1 = (idx0 >= 0) ? (idx0 + 1) : 0; // 1-based
  sc.put(ck, String(col1), SCACHE_TTL_VLONG); // 欄位位置不常變，放久一點
  return col1;
}

/** 直接從 Sheet 讀最新 course_level（不走快取） */
function _readCourseLevelFromSheet_(uid){
  if (!uid) return '';
  const sh = SHEET('會員清單');
  if (!sh) return '';

  // 先用索引找 row
  let rowNum = (getMemberIndex() || {})[normalizeKey(uid)];

  // 後援：索引尚未含新列時，TextFinder 找一次並更新索引
  if (!rowNum) {
    const hit = findRowByValue('會員清單', 2, uid, 2); // B 欄找 uid
    if (hit && hit.rowNum) {
      rowNum = hit.rowNum;
      try { updateMemberIndex(uid, rowNum); } catch(_) {}
    }
  }
  if (!rowNum) return '';

  const col1 = _courseLevelCol1_();
  if (!col1) return '';

  const v = sh.getRange(rowNum, col1).getValue();
  return String(v || '').trim();
}

function getCourseLevelFast(uid, force=false){
  const uc = CacheService.getUserCache();
  const k1 = uid + '_course_level';
  const k2 = uid + '_courseLevel';

  if (!force) {
    const hit1 = uc.get(k1);
    if (hit1 !== null) return hit1; // 允許空字串也是有效快取
    const hit2 = uc.get(k2);
    if (hit2 !== null) return hit2;
  }

  const level = _readCourseLevelFromSheet_(uid);
  try { uc.put(k1, level, UCACHE_TTL_MED); } catch(_) {}
  try { uc.put(k2, level, UCACHE_TTL_MED); } catch(_) {}
  return level;
}

/** 強制把最新 course_level 同步進快取（給「每日任務」入口用） */
function refreshCourseLevelCache(uid){
  return getCourseLevelFast(uid, true);
}

/**（可選）你要手動清快取時用 */
function invalidateCourseLevelCache(uid){
  const uc = CacheService.getUserCache();
  try { uc.remove(uid + '_course_level'); } catch(_) {}
  try { uc.remove(uid + '_courseLevel'); } catch(_) {}
}

// 向下相容：如果你其他地方習慣叫 getCourseLevel()
function getCourseLevel(uid, force=false){
  return getCourseLevelFast(uid, !!force);
}

/** ================== 覆蓋：hotOnDemandKick ================== **/
function hotOnDemandKick(uidOpt) {
  const sc = CacheService.getScriptCache();

  // ready 旗標：warm 完成才會設；入口只要讀兩個 cache key（非常快）
  const l1Ready = sc.get('hot:ready:L1') === '1';
  const l2Ready = sc.get('hot:ready:L2') === '1';
  if (l1Ready && l2Ready) return;

  // L1：20 分鐘最多排一次
  if (!l1Ready) {
    const k = 'hot:kick:L1';
    if (sc.get(k) !== '1') {
      sc.put(k, '1', Math.min(HOT_LIGHT_MIN_GAP_SEC, 21600));
      _ensureOneOffTrigger('hot_warmLight', 'hot_warmLight', 1200);
    }
  }

  // L2：6 小時最多排一次
  if (!l2Ready) {
    const k = 'hot:kick:L2';
    if (sc.get(k) !== '1') {
      sc.put(k, '1', Math.min(HOT_HEAVY_MIN_GAP_SEC, 21600));
      _ensureOneOffTrigger('hot_warmHeavy', 'hot_warmHeavy', 6000);
    }
  }
}

// 建立「一次性」觸發器（同名只會存在一個）
function _ensureOneOffTrigger(flagName, handlerName, delayMs) {
  const ps = PropertiesService.getScriptProperties();
  const key = 'trg:' + flagName;
  if (ps.getProperty(key)) return;  // 已排程，不重複

  const t = ScriptApp.newTrigger(handlerName).timeBased()
    .after(Math.max(500, delayMs || 1000)).create();

  if (t.getUniqueId) ps.setProperty(key, t.getUniqueId());
  else ps.setProperty(key, '1'); // 部分環境沒有 uniqueId 也無妨
}

// 解除一次性觸發器
function _clearOneOffTrigger(flagName) {
  const ps = PropertiesService.getScriptProperties();
  const key = 'trg:' + flagName;
  const id  = ps.getProperty(key);
  if (!id) return;
  try {
    ScriptApp.getProjectTriggers().forEach(t => {
      if (!t.getUniqueId || t.getUniqueId() === id) ScriptApp.deleteTrigger(t);
    });
  } catch (_){}
  ps.deleteProperty(key);
}

/** ================== 覆蓋：hot_warmLight ================== **/
function hot_warmLight() {
  const sc = CacheService.getScriptCache();
  try {
    getMemberIndex();
    getIndexByUid_A('運算紀錄表');
    getIndexByUid_A('聯合碼紀錄表');
    getIndexByUid_B('雙人配對運算紀錄表');

    TABLES.MAIN_PAID(); TABLES.ICE_HEART(); TABLES.WUXING(); TABLES.EMOTION();

    try {
      if (typeof t21_getContentACCached_ === 'function') t21_getContentACCached_();
      if (typeof t21_idxMap_ === 'function')            t21_idxMap_();
      if (typeof t21_getProgressHeadersCached_==='function') t21_getProgressHeadersCached_();
    } catch(_) {}

    // ✅ 設 ready：入口讀到就不再排 warm
    sc.put('hot:ready:L1', '1', Math.min(HOT_LIGHT_MIN_GAP_SEC, 21600));
  } catch (e) {
    Logger.log('hot_warmLight error: ' + e);
  } finally {
    _clearOneOffTrigger('hot_warmLight');
  }
}

/** ================== 覆蓋：hot_warmHeavy ================== **/
function hot_warmHeavy() {
  const sc = CacheService.getScriptCache();
  try {
    TABLES.FLOW(); TABLES.LUCK20(); TABLES.PROD(); TABLES.SERV();
    TABLES.FIN();  TABLES.INS();    TABLES.ESTATE(); TABLES.UNION81();

    sc.put('hot:ready:L2', '1', Math.min(HOT_HEAVY_MIN_GAP_SEC, 21600));
  } catch (e) {
    Logger.log('hot_warmHeavy error: ' + e);
  } finally {
    _clearOneOffTrigger('hot_warmHeavy');
  }
}

/** 手動重置（想立刻重暖時用） */
function hot_resetWarmFlags() {
  const ps = PropertiesService.getScriptProperties();
  ['hot:lastL1','hot:lastL2','trg:hot_warmLight','trg:hot_warmHeavy'].forEach(k => { try{ps.deleteProperty(k);}catch(_){ }});
  return 'OK';
}

const COLORS = {
  bgCard: "#FFFFFF",   // 卡片底
  textTitle: "#0E3A65",// 深海藍（標題）
  textBody:  "#41566B",// 灰藍（內文）
  textHint:  "#6B7C93",// 提示
  btnPrimary:"#0E63B7",// 主按鈕（快速選單）
  btnSecondary:"#E6EEF7", // 次按鈕（手動輸入）
  border: "#D8E6F3"    // 分隔線
};

const BRAND = {
  navy:   (typeof COLORS!=='undefined' && COLORS.textTitle) ? COLORS.textTitle : '#0E3A65',
  body:   (typeof COLORS!=='undefined' && COLORS.textBody)  ? COLORS.textBody  : '#41566B',
  hint:   (typeof COLORS!=='undefined' && COLORS.textHint)  ? COLORS.textHint  : '#6B7C93',
  blue:   '#2275c0',     // 已解鎖「查看」按鈕
  bronze: '#C8A16B',     // 銅級
  silver: '#AEB7C2',     // 銀級
  gold:   '#FFC806'      // 金級
};

const FREE_MAIN_AFFIRM = '💫 點一下查看主性格\n找尋專屬於你的亮點';
const flexCache = new Map();

function buildBirthdayFlex({ header, isCustomer, initial, min, max, manualText }) {
  const cacheKey = JSON.stringify({ header, isCustomer, initial, min, max, manualText: !!manualText });
  if (flexCache.has(cacheKey)) return flexCache.get(cacheKey);

  const manualMsg = manualText
    ? manualText
    : (isCustomer ? '請輸入客戶生日（格式：YYYY-MM-DD）' : '請輸入生日（格式：YYYY-MM-DD）');

  const contents = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "20px",
      spacing: "md",
      backgroundColor: COLORS.bgCard,
      contents: [
        // 標題
        { type: "text", text: header, weight: "bold", size: "xl", align: "center", color: COLORS.textTitle },
        { type: "separator", margin: "sm", color: COLORS.border },

        // ★ 高級感提醒 Callout（安全版：不使用 box 的 width）
        {
          type: "box",
          layout: "vertical",
          backgroundColor: "#F7FAFE",   // 淡藍底
          paddingAll: "12px",
          spacing: "xs",
          margin: "md",
          contents: [
            // 金色小標籤（用文字+背景色模擬，不用 width）
            {
              type: "box",
              layout: "horizontal",
              backgroundColor: "#FBE8B6", // 淺金底（#FFD179 的柔和版）
              paddingAll: "4px",
              justifyContent: "center",
              contents: [
                { type: "text", text: "重要提醒", size: "xs", weight: "bold", color: "#0E3A65", align: "center" }
              ]
            },
            // 你的原句（加粗、置中、可換行）
            {
              type: "text",
              text: LOADING_EMPHASIS,
              size: "sm",
              weight: "bold",
              color: "#0E3A65",
              align: "center",
              wrap: true
            }
          ]
        },

        { type: "text", wrap: true, size: "sm", align: "center", color: "#0E63B7", text: "（可手動輸入或使用快速選單）" },

        // 按鈕
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "md",
          contents: [
            {
              type: "button",
              height: "md",
              style: "primary",
              color: COLORS.btnPrimary,
              action: {
                type: "datetimepicker",
                label: "快速選單",
                data: "action=birthday_quick",
                mode: "date",
                initial, min, max
              }
            },
            {
              type: "button",
              height: "md",
              style: "secondary",
              color: COLORS.btnSecondary,
              action: { type: "message", label: "手動輸入生日", text: manualMsg }
            }
          ]
        }
      ]
    }
  };

  const msg = { type: "flex", altText: header, contents };
  flexCache.set(cacheKey, msg);
  return msg;
}

// ====== 可本地測試的假資料 ======
function _debugFakeWoo(){
  if (PropertiesService.getScriptProperties().getProperty('DEBUG_MODE') !== '1') {
    throw new Error('DEBUG_MODE 未開啟，禁止執行 _debugFakeWoo');
  }
  handleWooOrder({
    source: 'woo',
    status: 'processing',
    order_id: 'FAKE-' + Date.now(),
    line_uid: 'Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    total: '199',
    email: 'test@example.com',
    items: [
      { product_id: '43764', variation_id: '', sku: 'BRONZE-1M', qty: 1 }
    ]
  });
}

// 共用升級邏輯（PROMO / WOO 都可用）
function applyMembershipUpgrade_(uid, targetLevel, addMonths, addDays, source, note){
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('會員清單');
  const idxMap = getMemberIndex();
  let rowNum = idxMap[normalizeKey(uid)];
  let prevLevel='', prevExpire='';

  if(!rowNum){
    sh.appendRow([new Date(), uid, getUserDisplayName(uid) || '', '免費會員', '', '', source||'', '']);
    rowNum = sh.getLastRow();
    updateMemberIndex(uid, rowNum);
  }else{
    prevExpire = sh.getRange(rowNum,1).getValue();
    prevLevel  = sh.getRange(rowNum,4).getValue();
  }

  const levelRank = _rankMap();
  const now  = new Date();
  const cur  = (prevExpire && prevExpire instanceof Date && prevExpire > now) ? new Date(prevExpire) : new Date(now);

  if(addMonths>0) cur.setMonth(cur.getMonth() + Number(addMonths||0));
  if(addDays>0)   cur.setDate(cur.getDate() + Number(addDays||0));

  // 寫回到期與等級（等級只升級、不降級）
  const rowAtoD = sh.getRange(rowNum, 1, 1, 4).getValues()[0];
  rowAtoD[0] = cur;
  const curRank = levelRank[String(rowAtoD[3]||'免費會員')] ?? 0;
  const newRank = levelRank[String(targetLevel||'免費會員')] ?? 0;
  if(newRank > curRank) rowAtoD[3] = targetLevel;
  sh.getRange(rowNum, 1, 1, 4).setValues([rowAtoD]);

  const levelNow = rowAtoD[3];
  refreshMemberLevelCache(uid); // 同步快取

  return { ok:true, level: levelNow, expire: cur, prevLevel, prevExpire, msg:'升級完成', source, note };
}

function _fmtDate(d){
  if(!d || !(d instanceof Date)) return '';
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/** ============ Queue：事件驅動超快路徑 ============ **/
const WJ_FLAG    = 'wj:any';     // 有工作待處理
const WJ_TRIGGER = 'wj:trigger'; // 單次觸發器 id

function enqueueWriteJob(uid, parts) {
  const ps  = PropertiesService.getScriptProperties();
  const key = 'wj:' + String(uid).trim();

  // 合併同 uid（與原本邏輯一致）
  const cur = (function () {
    const now = Date.now();
    const prev = _safeParse(ps.getProperty(key)) || { uid: uid, ts: now };
    if (parts.member) prev.member = parts.member;
    if (parts.calc)   prev.calc   = parts.calc;
    if (parts.union)  prev.union  = parts.union;
    if (parts.pair)   prev.pair   = parts.pair;
    prev.ts = now;
    return prev;
  })();
  ps.setProperty(key, JSON.stringify(cur));

  // 標記 + 單次排程（保持原機制）
  ps.setProperty(WJ_FLAG, '1');
  ensureFlushScheduled(2000);

  // （選配）尖峰期 10 分鐘臨時開每分鐘 sweeper；平時零開銷
  try { armBurstSweeper(10); } catch (_) {}

  // ✅ 重點：讓這位使用者的工作「當下」處理完（不掃全量）
  try { microFlushIfUserHasJob(uid); } catch (_) {}
}

function microFlushIfUserHasJob(uid) {
  if (!uid) return;
  const ps = PropertiesService.getScriptProperties();
  const key = 'wj:' + String(uid).trim();
  let job = null;
  try { job = JSON.parse(ps.getProperty(key) || ''); } catch(_) {}
  if (!job || !job.uid) return; // 這個使用者沒有待處理

  // 先刪除，避免重覆
  ps.deleteProperty(key);

  try {
    // 與 flushWriteJobs 同步的前置：預熱索引，避免每次重建
    getMemberIndex();
    getIndexByUid_A('運算紀錄表');
    getIndexByUid_A('聯合碼紀錄表');
    getIndexByUid_B('雙人配對運算紀錄表');

    // 實際執行（沿用你既有的寫入函式）
    if (job.member) saveOrUpdateMember(job.uid, job.member.name || '', job.member.b1 || '', job.member.b2 || '', job.member.route || '');
    if (job.calc)   writeSixteenNumbers(job.uid, job.calc);
    if (job.union)  writeUnionCodes(job.uid, job.union);
    if (job.pair)   writeDualPairRecord(job.uid, job.pair.b1, job.pair.b2, job.pair.nA, job.pair.nB);

  } catch (e) {
    // 失敗放回佇列（下輪或 burstSweeper 再試）
    ps.setProperty(key, JSON.stringify({ ...job, ts: Date.now() }));
  }
}

function ensureMemberRowInline(uid){
  const sh = SpreadsheetApp.getActive().getSheetByName('會員清單');
  const idx = getMemberIndex()[normalizeKey(uid)];
  if (idx) return idx; // 已存在就不重複新增

  const name = getUserDisplayName(uid); // 可能為空，沒關係
  sh.appendRow([new Date(), uid, name || '', '免費會員', '', '', 'FOLLOW', '']);
  const rowNum = sh.getLastRow();
  updateMemberIndex(uid, rowNum);       // 同步索引
  return rowNum;
}

function armBurstSweeper(minutes){
  const ps = PropertiesService.getScriptProperties();
  const until = Date.now() + Math.max(1, minutes)*60*1000;
  const curUntil = parseInt(ps.getProperty('burst:until') || '0', 10);

  // 若已武裝且有效期更長，就只延長時間
  if (curUntil && curUntil > Date.now() + 60*1000) {
    ps.setProperty('burst:until', String(Math.max(curUntil, until)));
    return;
  }

  // 清掉舊的同名觸發器後重建
  try {
    ScriptApp.getProjectTriggers().forEach(t=>{
      if (t.getHandlerFunction && t.getHandlerFunction() === 'burstSweeper') ScriptApp.deleteTrigger(t);
    });
  } catch(_){}

  const trig = ScriptApp.newTrigger('burstSweeper').timeBased().everyMinutes(1).create();
  ps.setProperty('burst:until', String(until));
}

function burstSweeper(){
  const ps = PropertiesService.getScriptProperties();
  try { flushWriteJobs(); } catch (e) { Logger.log('burstSweeper flush error:' + e); }

  const hasJobs = Object.keys(ps.getProperties())
                    .some(k => k.startsWith('wj:') && k !== WJ_FLAG && k !== WJ_TRIGGER);
  const until = parseInt(ps.getProperty('burst:until') || '0', 10);
  const expired = !until || Date.now() > until;

  if (!hasJobs && expired) {
    // 自我卸載：移除自己的 time trigger 與旗標
    try {
      ScriptApp.getProjectTriggers().forEach(t=>{
        if (t.getHandlerFunction && t.getHandlerFunction() === 'burstSweeper') ScriptApp.deleteTrigger(t);
      });
    } catch(_){}
    ps.deleteProperty('burst:until');
  }
}

// 2) 確保只存在一個「單次」觸發器
function ensureFlushScheduled(delayMs) {
  const ps = PropertiesService.getScriptProperties();
  if (ps.getProperty(WJ_TRIGGER)) return; // 已排程
  const t = ScriptApp.newTrigger('flushWriteJobs').timeBased()
    .after(Math.max(2000, delayMs || 5000)).create();
  // getUniqueId 在 Apps Script 可用，用來對應刪除
  if (t.getUniqueId) ps.setProperty(WJ_TRIGGER, t.getUniqueId());
  else ps.setProperty(WJ_TRIGGER, '1'); // 少數環境拿不到 id 也無妨
}

// 3) 清空器：只有有工作才跑；處理完若還有工作再排下一次；否則撤銷排程
function flushWriteJobs() {
  const ps = PropertiesService.getScriptProperties();

  // ★ O(1) 快速短路：沒有工作就直接結束（避開冷啟動浪費）
  if (ps.getProperty(WJ_FLAG) !== '1') { _clearOneOffTriggerIfAny(); return; }

  // 取出最多 200 筆 wj:*，先刪再處理避免重複
  const all  = ps.getProperties();
  const keys = Object.keys(all)
    .filter(k => k.startsWith('wj:') && k !== WJ_FLAG && k !== WJ_TRIGGER)
    .slice(0, 200);
  if (!keys.length) { // 沒有真正工作，清旗標並撤銷觸發器
    ps.deleteProperty(WJ_FLAG);
    _clearOneOffTriggerIfAny();
    return;
  }

  const jobs = [];
  keys.forEach(k => { const job = _safeParse(all[k]); ps.deleteProperty(k); if (job && job.uid) jobs.push(job); });

  // 可選的小優化：預先抓共用資源，避免迴圈中重複拿
  const shMember = SpreadsheetApp.getActive().getSheetByName('會員清單');
  const shCalc   = SpreadsheetApp.getActive().getSheetByName('運算紀錄表');
  const shUnion  = SpreadsheetApp.getActive().getSheetByName('聯合碼紀錄表');
  const shPair   = SpreadsheetApp.getActive().getSheetByName('雙人配對運算紀錄表');
  // 預熱索引（你原本的方法已快取在 ScriptCache，不用改）
  getMemberIndex(); getIndexByUid_A('運算紀錄表'); getIndexByUid_A('聯合碼紀錄表'); getIndexByUid_B('雙人配對運算紀錄表');

  // 實際執行（沿用你原來的寫表函式）
  jobs.forEach(job => {
    try {
      if (job.member) saveOrUpdateMember(job.uid, job.member.name || '', job.member.b1 || '', job.member.b2 || '', job.member.route || '');
      if (job.calc)   writeSixteenNumbers(job.uid, job.calc);
      if (job.union)  writeUnionCodes(job.uid, job.union);
      if (job.pair)   writeDualPairRecord(job.uid, job.pair.b1, job.pair.b2, job.pair.nA, job.pair.nB);
    } catch (e) {
      // 失敗放回佇列（下輪重試）
      ps.setProperty('wj:' + job.uid, JSON.stringify({ ...job, ts: Date.now() }));
    }
  });

  // 看看是否還有殘餘工作；有就 5 秒後再跑一次；沒有就收尾
  const stillHasJobs = Object.keys(ps.getProperties())
    .some(k => k.startsWith('wj:') && k !== WJ_FLAG && k !== WJ_TRIGGER);

  if (stillHasJobs) {
    ps.setProperty(WJ_FLAG, '1');
    ensureFlushScheduled(5000);
  } else {
    ps.deleteProperty(WJ_FLAG);
    _clearOneOffTriggerIfAny();
  }
}

// 輔助：撤銷單次觸發器
function _clearOneOffTriggerIfAny() {
  const ps = PropertiesService.getScriptProperties();
  const id = ps.getProperty(WJ_TRIGGER);
  if (!id) return;
  try {
    ScriptApp.getProjectTriggers().forEach(t => {
      if (!t.getUniqueId || t.getUniqueId() === id) ScriptApp.deleteTrigger(t);
    });
  } catch (_) {}
  ps.deleteProperty(WJ_TRIGGER);
}

/** 把剛算好的結果先塞到 UserCache，使用者可以立刻點各項 postback */
function primeUserCachesAfterCalc(uid, sixteen, union12, pairRow /*可為 null*/) {
  const uc = CacheService.getUserCache();

  // 運算紀錄表一列：[uid, n1..n16]
  const calcRow = [uid];
  for (let i = 1; i <= 16; i++) calcRow.push(sixteen['n' + i]);
  _putJson(uc, 'calcRow:' + uid, calcRow, UCACHE_TTL_SHORT);

  // 聯合碼紀錄表一列：[uid, code1..code12]
  const unionRow = [uid].concat(union12);
  _putJson(uc, 'unionRow:' + uid, unionRow, UCACHE_TTL_SHORT);

  if (pairRow) {
    _putJson(uc, 'pairRow:' + uid, pairRow, UCACHE_TTL_SHORT);
  }
}

/** 依你的表頭格式，產出「雙人/親子配對」用的一列資料（不寫表，只回陣列） */
function buildPairRow(uid, birthdayA, birthdayB, nA, nB) {
  const wuXingA = getWuXingByN7(nA.n7);
  const wuXingB = getWuXingByN7(nB.n7);
  return [
    new Date(), uid,
    birthdayA, birthdayB,
    nA.n1, nA.n4, nA.n7, wuXingA, nA.n7,
    nB.n1, nB.n4, nB.n7, wuXingB, nB.n7
  ];
}

function invalidateIndex(sheetName, colLetter) {
  CacheService.getScriptCache().remove(`idx:${sheetName}:${colLetter}`);
}

/** 允許的跳轉白名單（避免被植入外部網址） */
const REDIRECT_ALLOWLIST = [
  'https://relhroom.com/system-lite/',
  'https://relhroom.com/product/43792/',  // 金級 1 個月（例）
  'https://relhroom.com/product/43801/',  // 金級 6 個月（例）
  'https://relhroom.com/cart/',           // 也可放加入購物車頁
];

/** 訂閱方案 → 對應的商店落地頁 */
const PLAN_REDIRECT_MAP = {
  // 你可以保留既有商品頁；若希望點任何等級都先到「精簡列表」，也可都設為 system-lite
  bronze_1m : 'https://relhroom.com/system-lite/',
  bronze_3m : 'https://relhroom.com/system-lite/',
  bronze_6m : 'https://relhroom.com/system-lite/',
  silver_1m : 'https://relhroom.com/system-lite/',
  silver_3m : 'https://relhroom.com/system-lite/',
  silver_12m: 'https://relhroom.com/system-lite/',
  gold_1m   : 'https://relhroom.com/system-lite/',
  gold_6m   : 'https://relhroom.com/system-lite/',
  gold_12m  : 'https://relhroom.com/system-lite/',
  // 預設導到精簡頁
  default   : 'https://relhroom.com/system-lite/'
};

/** 檢查目標是否在白名單 */
function _isAllowedRedirect(url) {
  try {
    const u = String(url || '').trim();
    return REDIRECT_ALLOWLIST.some(allow => u.startsWith(allow)) || u === PLAN_REDIRECT_MAP.default;
  } catch(_) { return false; }
}

/** ================= TURBO CORE (新增) ================= **/
const __TURBO = {
  ss: null,
  sheets: Object.create(null),
  token: null,
  tz: null,
  lineProfCache: Object.create(null),
};

function SS(){ return __TURBO.ss || (__TURBO.ss = SpreadsheetApp.getActive()); }
function SHEET(name){
  const k = String(name||'');
  if (!__TURBO.sheets[k]) __TURBO.sheets[k] = SS().getSheetByName(k);
  return __TURBO.sheets[k];
}
function TZ(){ return __TURBO.tz || (__TURBO.tz = (Session.getScriptTimeZone() || 'Asia/Taipei')); }
function CHANNEL_TOKEN(){ 
  if (__TURBO.token) return __TURBO.token;
  __TURBO.token = PropertiesService.getScriptProperties().getProperty('CHANNEL_TOKEN') || '';
  return __TURBO.token;
}

function nowISO_(){
  return Utilities.formatDate(new Date(), TZ(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}
function todayYMD_(){
  return Utilities.formatDate(new Date(), TZ(), 'yyyy-MM-dd');
}

function replyMessage(replyToken, messages){
  try {
    if (!replyToken || !messages || !messages.length) return null;

    // 先過濾空值
    const msgs = messages.filter(Boolean);

    // 只在「第21天有 Flex + 恭喜」的情境下調整優先序
    const flexIdx = msgs.findIndex(m => m && m.type === 'flex');
    const congratsIdx = msgs.findIndex(m =>
      m && m.type === 'text' && /恭喜|完成.{0,3}21|第?21天.*(完成|達成)?/.test(String(m.text || ''))
    );

    let ordered = msgs;
    if (flexIdx > -1 && congratsIdx > -1) {
      const flexMsg = msgs[flexIdx];
      const congratsMsg = msgs[congratsIdx];
      const rest = msgs.filter((_, i) => i !== flexIdx && i !== congratsIdx);
      // 固定：1) Flex  2) 恭喜  3) 其他
      ordered = [flexMsg, congratsMsg, ...rest];
    }

    // LINE 上限 5 則，截斷但已保住「Flex + 恭喜」
    const limited = ordered.slice(0, 5);

    return UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + CHANNEL_TOKEN() },
      payload: JSON.stringify({ replyToken, messages: limited }),
      muteHttpExceptions: true
    });
  } catch(_){ return null; }
}

function replyText(replyToken, text){ return replyMessage(replyToken, [{type:'text', text:String(text||'')}]); }

function getLineProfileFast(uid){
  if (!uid) return { displayName:'' };
  if (__TURBO.lineProfCache[uid]) return __TURBO.lineProfCache[uid];

  const uc = CacheService.getUserCache();
  const ck = 'TURBO_PROF:'+uid;
  const hit = uc.get(ck);
  if (hit){
    try { __TURBO.lineProfCache[uid] = JSON.parse(hit); return __TURBO.lineProfCache[uid]; } catch(_){}
  }
  try {
    const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/profile/' + encodeURIComponent(uid), {
      method:'get',
      headers:{Authorization:'Bearer '+CHANNEL_TOKEN()},
      muteHttpExceptions:true
    });
    if (res.getResponseCode()>=200 && res.getResponseCode()<300){
      const j = JSON.parse(res.getContentText()||'{}');
      const v = { displayName: j.displayName || '' };
      uc.put(ck, JSON.stringify(v), 600);
      __TURBO.lineProfCache[uid] = v;
      return v;
    }
  } catch(_){}
  return { displayName:'' };
}

const JCache = {
  get(cache, key){ if(!cache) return null; const s = cache.get(key); if (!s) return null; try{ return JSON.parse(s);}catch(_){ return null; } },
  put(cache, key, obj, ttl){ if(!cache) return; try{ cache.put(key, JSON.stringify(obj), ttl);}catch(_){ } }
};

function headersCached(sheetName, ttl){
  const sc = CacheService.getScriptCache();
  const ck = 'hdr:'+sheetName;
  let meta = JCache.get(sc, ck);
  if (meta) return meta;
  const sh = SHEET(sheetName); if (!sh) return { headers:[] };
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  meta = { headers }; JCache.put(sc, ck, meta, ttl||21600);
  return meta;
}

function withDocLock(fn){
  const lock = LockService.getDocumentLock();
  let ok = false;
  try{ ok = lock.tryLock(500); }catch(_){}
  try{ return fn(!!ok); }
  finally{ try{ if(ok) lock.releaseLock(); }catch(_){} }
}
/** ====================================================== **/

// 2) 取 81組內容的封裝（可讀性佳）
function getUnion81Content(code) {
  const row = TABLES.UNION81()[String(code).trim()];
  if (!row) return null;
  return {
    code:   row[0],
    core:   row[1], // 能力核心（B）
    warm:   row[2], // 溫馨提醒（C）
    work:   row[3], // 工作建議（D）
    love:   row[4], // 愛情建議（E）
    wealth: row[5], // 財富建議（F）
  };
}

// 3)（可選）手動失效：若你偶爾會改 81表單內容，可呼叫這個
function invalidateUnion81Cache() {
  invalidateTableCache('81組聯合碼內容表單', 0);
}

// 4)（可選）預熱：想讓第一次點也快，可在觸發器 or 首次部署後呼叫一次
function warmUnion81Cache() {
  TABLES.UNION81(); // 觸發快取建置
}

// --- 在公用區新增 ---
function invalidateUserComputedRows(uid) {
  const uc = CacheService.getUserCache();
  uc.remove('calcRow:' + uid);  // 個人七數/十六數
  uc.remove('pairRow:' + uid);  // 雙人配對列
  uc.remove('unionRow:' + uid); // 聯合碼列（保險 20 年大運等會用）
}

// 整張內容表做 map 快取（key 為某欄）
function getTableMapCached(sheetName, keyColIndex0, ttl = SCACHE_TTL_LONG){
  const sc = CacheService.getScriptCache();
  const ck = `tbl:${sheetName}:k${keyColIndex0}`;
  let map = _getJson(sc, ck);
  if(map) return map;

  const lock = LockService.getScriptLock();
  try{ lock.tryLock(500); }catch(_){}

  map = _getJson(sc, ck);
  if(map){ try{lock.releaseLock();}catch(_){ } return map; }

  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if(!sheet){ try{lock.releaseLock();}catch(_){ } return {}; }

  const data = sheet.getDataRange().getValues();
  map = {};
  for(let i=0;i<data.length;i++){
    const key = normalizeKey(data[i][keyColIndex0]);
    if(key) map[key] = data[i];
  }
  _putJson(sc, ck, map, ttl);
  try{ lock.releaseLock(); }catch(_){}
  return map;
}

/** 讀「會員清單」的等級（優先讀 UserCache 的等級／列號），回寫 UserCache */
function getMemberLevelFast(uid) {
  const uc = CacheService.getUserCache();
  const lvKey = uid + '_level';
  const cached = uc.get(lvKey);
  if (cached) return cached;

  let level = '免費會員';
  // 先走索引（若你已實作 getMemberIndex）
  if (typeof getMemberIndex === 'function') {
    const idx = getMemberIndex()[normalizeKey(uid)];
    if (idx) {
      const sheet = SpreadsheetApp.getActive().getSheetByName('會員清單');
      const v = sheet.getRange(idx, 4).getValue(); // D 欄 Level
      if (v) level = v;
      uc.put(lvKey, level, UCACHE_TTL_MED);
      return level;
    }
  }

  // fallback: TextFinder
  const hit = findRowByValue('會員清單', 2, uid);
  if (hit && hit.row && hit.row.length >= 4 && hit.row[3]) level = hit.row[3];
  uc.put(lvKey, level, UCACHE_TTL_MED);
  return level;
}

function getMemberRowByUidFast(uid){
  const idxMap = getMemberIndex();
  const rowNum = idxMap[normalizeKey(uid)];
  if(!rowNum) return null;
  const sh = SpreadsheetApp.getActive().getSheetByName('會員清單');
  return { rowNum, row: sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0], sheet: sh };
}

/** 覆蓋：讀「運算紀錄表」A=uid，加入 TextFinder 後援避免剛寫表就找不到 */
function getCalcRowByUid(uid) {
  const uc = CacheService.getUserCache();
  const ck = 'calcRow:' + uid;
  const cached = _getJson(uc, ck);
  if (cached) return cached;

  // 先走索引
  const idx = getIndexByUid_A('運算紀錄表')[normalizeKey(uid)];
  if (idx) {
    const row = getRowByIndex('運算紀錄表', idx);
    if (row) { _putJson(uc, ck, row, UCACHE_TTL_SHORT); return row; }
  }

  // 後援：索引尚未重建時，用 TextFinder 掃一次
  const hit = findRowByValue('運算紀錄表', 1, uid, 2); // 第1欄(A)找 uid
  if (hit && hit.row) { _putJson(uc, ck, hit.row, UCACHE_TTL_SHORT); return hit.row; }

  return null;
}

function getPairRowByUid(uid) { // 雙人配對運算紀錄表 B=uid
  const uc = CacheService.getUserCache();
  const ck = 'pairRow:' + uid;
  const cached = _getJson(uc, ck);
  if (cached) return cached;

  const idx = getIndexByUid_B('雙人配對運算紀錄表')[normalizeKey(uid)];
  if (!idx) return null;
  const row = getRowByIndex('雙人配對運算紀錄表', idx);
  if (!row) return null;
  _putJson(uc, ck, row, UCACHE_TTL_SHORT);
  return row;
}

function getUnionRowByUid(uid) { // 聯合碼紀錄表 A=uid
  const uc = CacheService.getUserCache();
  const ck = 'unionRow:' + uid;
  const cached = _getJson(uc, ck);
  if (cached) return cached;

  const idx = getIndexByUid_A('聯合碼紀錄表')[normalizeKey(uid)];
  if (!idx) return null;
  const row = getRowByIndex('聯合碼紀錄表', idx);
  if (!row) return null;
  _putJson(uc, ck, row, UCACHE_TTL_SHORT);
  return row;
}

/** 取得主五行（WU Xing）表頭索引（緩存） */
function getMatrixCached(sheetName, ttl = SCACHE_TTL_LONG) {
  const sc = CacheService.getScriptCache();
  const ck = `matrix:${sheetName}`;
  let pack = _getJson(sc, ck);
  if (pack && pack.data && pack.header) return pack;

  const lock = LockService.getScriptLock();
  try { lock.tryLock(500); } catch(_){}

  pack = _getJson(sc, ck);
  if (pack && pack.data && pack.header) { try{lock.releaseLock();}catch(_){ } return pack; }

  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  pack = { data, header };
  _putJson(sc, ck, pack, ttl);
  try { lock.releaseLock(); } catch(_){}
  return pack;
}

/** 內容表 Map（主性格、破冰交心、五行、情緒、各商品/服務話術…） */
const TABLES = {
  MAIN_PAID: () => getTableMapCached('主性格付費表單', 0),
  ICE_HEART: () => getTableMapCached('破冰與交心內容表單', 0),
  WUXING:    () => getTableMapCached('五行內容表單', 0),
  EMOTION:   () => getTableMapCached('情緒內容表單', 0),
  FLOW:      () => getTableMapCached('流年內容表單', 0),
  LUCK20:    () => getTableMapCached('20年大運表單', 0),
  PROD:      () => getTableMapCached('有形商品成交分析', 0),
  SERV:      () => getTableMapCached('無形服務成交分析', 0),
  FIN:       () => getTableMapCached('金融商品成交分析', 0),
  INS:       () => getTableMapCached('保險商品成交分析', 0),
  ESTATE:    () => getTableMapCached('不動產商品成交分析', 0),
  UNION81: () => getTableMapCached('81組聯合碼內容表單', 0, SCACHE_TTL_VLONG),
};

function normalizeKey(v) { return String(v ?? '').trim(); }

// 只讀某欄位做搜尋（預設跳過表頭）
function findRowByValue(sheetName, colIndex1, value, startRow = 2){
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if(!sheet) return null;
  const lastRow = sheet.getLastRow();
  if(lastRow < startRow) return null;

  const key = normalizeKey(value);
  const range = sheet.getRange(startRow, colIndex1, lastRow - startRow + 1, 1);
  const tf = range.createTextFinder(key).matchEntireCell(true).useRegularExpression(false).findNext();
  if(!tf) return null;

  const rowNum = tf.getRow();
  const row = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
  return { rowNum, row, sheet };
}

function _safeParse(json){ if(!json) return null; try{ return JSON.parse(json);}catch(_){return null;} }

function _getJson(cache,key){ if(!cache||typeof cache.get!=='function') return null; return _safeParse(cache.get(key)); }

function _putJson(cache,key,obj,ttl){ if(!cache||typeof cache.put!=='function') return; try{ cache.put(key, JSON.stringify(obj), ttl);}catch(_){ } }

function invalidateTableCache(sheetName, keyColIndex0 = 0) {
  const sc = CacheService.getScriptCache();
  sc.remove(`tbl:${sheetName}:k${keyColIndex0}`);
}

function invalidateMatrixCache(sheetName) {
  const sc = CacheService.getScriptCache();
  sc.remove(`matrix:${sheetName}`);
}

// 會員清單索引：uid -> rowNumber(1-based)
function getMemberIndex(ttl = SCACHE_TTL_LONG){
  const sc = CacheService.getScriptCache();
  const CK = 'member:index';
  let idx = _getJson(sc, CK);
  if(idx) return idx;

  const sheet = SpreadsheetApp.getActive().getSheetByName('會員清單');
  if(!sheet) return {};
  const last = sheet.getLastRow();
  if(last < 2){ _putJson(sc, CK, {}, ttl); return {}; }

  const uids = sheet.getRange(2, 2, last-1, 1).getValues().flat(); // B 欄
  idx = {};
  for(let i=0;i<uids.length;i++){
    const uid = normalizeKey(uids[i]);
    if(uid) idx[uid] = i+2;
  }
  _putJson(sc, CK, idx, ttl);
  return idx;
}

// === 索引工具：建立 {uid -> rowNumber} ===
function getIndexByUid_A(sheetName, ttl = SCACHE_TTL_LONG){
  const sc = CacheService.getScriptCache();
  const CK = `idx:${sheetName}:A`;
  let idx = _getJson(sc, CK);
  if (idx) return idx;

  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) return {};
  const last = sh.getLastRow();
  if (last < 2) { _putJson(sc, CK, {}, ttl); return {}; }

  const keys = sh.getRange(2, 1, last-1, 1).getValues().flat(); // A欄
  idx = {};
  for (let i=0;i<keys.length;i++){
    const k = normalizeKey(keys[i]);
    if (k) idx[k] = i + 2; // 1-based
  }
  _putJson(sc, CK, idx, ttl);
  return idx;
}

function getIndexByUid_B(sheetName, ttl = SCACHE_TTL_LONG){
  const sc = CacheService.getScriptCache();
  const CK = `idx:${sheetName}:B`;
  let idx = _getJson(sc, CK);
  if (idx) return idx;

  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh) return {};
  const last = sh.getLastRow();
  if (last < 2) { _putJson(sc, CK, {}, ttl); return {}; }

  const keys = sh.getRange(2, 2, last-1, 1).getValues().flat(); // B欄
  idx = {};
  for (let i=0;i<keys.length;i++){
    const k = normalizeKey(keys[i]);
    if (k) idx[k] = i + 2; // 1-based
  }
  _putJson(sc, CK, idx, ttl);
  return idx;
}

function getRowByIndex(sheetName, rowNum){
  const sh = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sh || !rowNum) return null;
  return sh.getRange(rowNum, 1, 1, sh.getLastColumn()).getValues()[0];
}

function updateMemberIndex(uid,rowNumber){
  const sc = CacheService.getScriptCache();
  const CK = 'member:index';
  const cur = _getJson(sc, CK) || {};
  cur[normalizeKey(uid)] = rowNumber;
  _putJson(sc, CK, cur, SCACHE_TTL_LONG);
}

function refreshMemberLevelCache(uid){
  const sheet = SpreadsheetApp.getActive().getSheetByName('會員清單');
  const idxMap = getMemberIndex();
  const rowNum = idxMap[normalizeKey(uid)];
  if(!rowNum) return null;
  const level = String(sheet.getRange(rowNum,4).getValue() || '').trim();
  CacheService.getUserCache().put(uid + '_level', level, UCACHE_TTL_MED);
  return level;
}

// 依表頭名稱找欄位 index；names 可給多個候選名，會依序嘗試
function _colIndexByHeader(headerRow, names) {
  const namesArr = Array.isArray(names) ? names : [names];
  for (const name of namesArr) {
    const i = headerRow.findIndex(h => String(h).trim() === String(name).trim());
    if (i !== -1) return i;
  }
  return -1;
}

// 讀整張表，回傳 {header, rows, mapByKey}；keyColIndex0 預設 A 欄
function getTableWithHeader(sheetName, keyColIndex0 = 0, ttl = SCACHE_TTL_LONG) {
  const sc = CacheService.getScriptCache();
  const ck = `twh:${sheetName}:k${keyColIndex0}`;
  let pack = _getJson(sc, ck);
  if (pack) return pack;

  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) return { header: [], rows: [], mapByKey: {} };

  const data = sheet.getDataRange().getValues();
  if (!data.length) return { header: [], rows: [], mapByKey: {} };

  const header = data[0];
  const rows   = data.slice(1);
  const mapByKey = {};
  rows.forEach(r => {
    const key = normalizeKey(r[keyColIndex0]);
    if (key) mapByKey[key] = r;
  });

  pack = { header, rows, mapByKey };
  _putJson(sc, ck, pack, ttl);
  return pack;
}

// ====== Woo Webhook 入口（驗簽可選） ======
function _verifyWooSignature(e){ return true; } // 如需額外驗簽可自行實作
function _verifyWooHmac(body, headerSig){
  var secret = PropertiesService.getScriptProperties().getProperty('WOO_WEBHOOK_SECRET');
  if(!secret) return true;
  if(!headerSig) return false;
  var computed = Utilities.computeHmacSha256Signature(body, secret);
  var base64 = Utilities.base64Encode(computed);
  return headerSig === base64;
}

function tryHandleWoo(e){
  try{
    var bodyStr = e.postData && e.postData.contents || '';
    var ok = _verifyWooSignature(e) || _verifyWooHmac(bodyStr, (e.parameter && e.parameter.sig));
    if(!ok) return false;

    var body = _safeParse(bodyStr);
    if(!body || body.source !== 'woo') return false;

    handleWooOrder(body);
    return true;
  }catch(err){
    Logger.log('tryHandleWoo error: ' + err);
    return false;
  }
}

// 安全包裝（若你專案已有 getUserDisplayName / sendPushToUser，就會用你的）
function _safeGetUserDisplayName(uid){
  try{ return (typeof getUserDisplayName==='function') ? getUserDisplayName(uid) : uid; }catch(_){ return uid; }
}

function _safeSendPush(uid, text){
  try{ if(typeof sendPushToUser==='function') sendPushToUser(uid, text); }catch(_){}
}

function doPost(e) {
  try {
    // ★ 防呆：從編輯器手動執行或 LINE 沒帶內容時，直接早退
    if (!e || !e.postData || !e.postData.contents) {
      Logger.log('doPost called without payload; ignoring.');
      return ContentService.createTextOutput('OK');
    }

    // ★ 如果是 Woo 事件，直接處理並結束
    if (typeof tryHandleWoo === 'function' && tryHandleWoo(e)) {
      return ContentService.createTextOutput('OK');
    }

    // ★ 安全解析
    let body;
    try { body = JSON.parse(e.postData.contents); }
    catch (parseErr) {
      Logger.log('Invalid JSON payload: ' + parseErr);
      return ContentService.createTextOutput('OK');
    }

    const event = (body && body.events && body.events[0]) ? body.events[0] : {};
    Logger.log('doPost 收到 event：' + JSON.stringify(event));

    const replyToken     = (event && event.replyToken) || null;
    const userId         = (event && event.source && event.source.userId) ? event.source.userId : null;
    const userMessage    = (event && event.message && event.message.text) ? event.message.text : null;
    const postbackData   = (event && event.postback && event.postback.data) ? event.postback.data : null;
    const postbackParams = (event && event.postback && event.postback.params) ? event.postback.params : null;

    // ✅ 改為「點擊才暖」：取得 userId 後，非同步啟動一次性暖機
    try { if (userId) hotOnDemandKick(userId); } catch(_) {}

    if (event && event.type === 'follow' && typeof onFollow === 'function') {
      onFollow(event);
      return ContentService.createTextOutput('OK');
    }

    // ★ 防呆：沒有 userId 或 replyToken 時，不處理
    if (!userId || !replyToken) {
      Logger.log('缺少 userId 或 replyToken，事件結構：' + JSON.stringify(event));
      return ContentService.createTextOutput('OK');
    }

    const cache = CacheService.getUserCache();
    const userState = cache.get(userId + '_state');

    // ===================== 21 天：關鍵字指令 =====================
    if (userMessage === '21天洞察') {
      T21_CMD_setModule_(replyToken, userId, 'insight');
      return ContentService.createTextOutput('OK');
    } else if (userMessage === '21天甦醒') {
      T21_CMD_setModule_(replyToken, userId, 'awaken');
      return ContentService.createTextOutput('OK');
    } else if (userMessage === '21天操練') {
      T21_CMD_setModule_(replyToken, userId, 'practice');
      return ContentService.createTextOutput('OK');
    } else if (userMessage === '每日任務') {
      // ✅ 讓你在課堂手動改 course_level 後，立刻生效（不等 30 分鐘快取過期）
      try { refreshCourseLevelCache(userId); } catch(_) {}
      T21_CMD_dailyTask_(replyToken, userId);
      return ContentService.createTextOutput('OK');
    } else if (userMessage === 'PING') {
      t21_handleEvent_(event); // 讓 t21 回 PONG
      return ContentService.createTextOutput('OK');
    }
    // ===================== 21 天：END =====================

    // --- 你的既有業務分流 ---
    if (userMessage === '個人解析') {
      cache.put(userId + '_state', 'ROUTE_PERSONAL', 600);
      if (typeof sendBirthdayInputPrompt === 'function') sendBirthdayInputPrompt(replyToken);
      return ContentService.createTextOutput('OK');

    } else if (userMessage === '每日抽卡') {
      if (typeof handleDailyDrawImageFast === 'function') handleDailyDrawImageFast(userId, replyToken, cache);
      return ContentService.createTextOutput('OK');

    } else if (userMessage === '有形商品成交分析') {
      cache.put(userId + '_state', 'ROUTE_PRODUCT', 600);
      if (typeof sendBirthdayInputPrompt === 'function') sendBirthdayInputPrompt(replyToken, cache.get(userId + '_state'));
      return ContentService.createTextOutput('OK');

    } else if (userMessage === '無形服務成交分析') {
      cache.put(userId + '_state', 'ROUTE_SERVICE', 600);
      if (typeof sendBirthdayInputPrompt === 'function') sendBirthdayInputPrompt(replyToken, cache.get(userId + '_state'));
      return ContentService.createTextOutput('OK');

    } else if (userMessage === '金融商品成交分析') {
      cache.put(userId + '_state', 'ROUTE_FINANCE', 600);
      if (typeof sendBirthdayInputPrompt === 'function') sendBirthdayInputPrompt(replyToken, cache.get(userId + '_state'));
      return ContentService.createTextOutput('OK');

    } else if (userMessage === '保險商品成交分析') {
      cache.put(userId + '_state', 'ROUTE_INSURE', 600);
      if (typeof sendBirthdayInputPrompt === 'function') sendBirthdayInputPrompt(replyToken, cache.get(userId + '_state'));
      return ContentService.createTextOutput('OK');

    } else if (userMessage === '不動產商品成交分析') {
      cache.put(userId + '_state', 'ROUTE_ESTATE', 600);
      if (typeof sendBirthdayInputPrompt === 'function') sendBirthdayInputPrompt(replyToken, cache.get(userId + '_state'));
      return ContentService.createTextOutput('OK');

    } else if (userMessage === '夥伴能力分析') {
      cache.put(userId + '_state', 'ROUTE_PARTNER', 600);
      if (typeof sendBirthdayInputPrompt === 'function') sendBirthdayInputPrompt(replyToken);
      return ContentService.createTextOutput('OK');

    } else if (userMessage === '伴侶配對解析') {
      cache.put(userId + '_state', 'ROUTE_DUAL_1', 600);
      if (typeof getDualBirthdayPrompt === 'function') replyMessage(replyToken, [getDualBirthdayPrompt(1)]);
      return ContentService.createTextOutput('OK');

    } else if (userMessage === '親子配對解析') {
      cache.put(userId + '_state', 'ROUTE_PARENT_1', 600);
      if (typeof sendParentBirthdayPrompt === 'function') {
        const msg = sendParentBirthdayPrompt(replyToken, 1);
        replyMessage(replyToken, [msg]);
      }
      return ContentService.createTextOutput('OK');

    } else if (typeof isValidBirthday === 'function' && isValidBirthday(userMessage)) {
      if (typeof handleBirthday === 'function') handleBirthday(userId, replyToken, userMessage, userState, cache);
      return ContentService.createTextOutput('OK');

    } else if (postbackData && postbackData.includes('action=birthday_quick') && postbackParams && postbackParams.date) {
      const birthday = postbackParams.date;
      if (typeof handleBirthday === 'function') handleBirthday(userId, replyToken, birthday, userState, cache);
      return ContentService.createTextOutput('OK');

    // === 既有 postback mapping（以下維持原樣） ===
    } else if (postbackData && postbackData.startsWith('PERSONAL_main_')) {
      const uid = postbackData.replace('PERSONAL_main_', '');
      if (typeof sendMainNumberDescription === 'function') sendMainNumberDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PERSONAL_ice_')) {
      const uid = postbackData.replace('PERSONAL_ice_', '');
      if (typeof sendPersonalIceDescription === 'function') sendPersonalIceDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PERSONAL_heart_')) {
      const uid = postbackData.replace('PERSONAL_heart_', '');
      if (typeof sendPersonalHeartDescription === 'function') sendPersonalHeartDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PERSONAL_flow_')) {
      const uid = postbackData.replace('PERSONAL_flow_', '');
      if (typeof sendPersonalFlowDescription === 'function') sendPersonalFlowDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PERSONAL_element_')) {
      const uid = postbackData.replace('PERSONAL_element_', '');
      if (typeof sendPersonalElementDescription === 'function') sendPersonalElementDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PERSONAL_emotion_')) {
      const uid = postbackData.replace('PERSONAL_emotion_', '');
      if (typeof sendPersonalEmotionDescription === 'function') sendPersonalEmotionDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PERSONAL_luck20_')) {
      const uid = postbackData.replace('PERSONAL_luck20_', '');
      if (typeof sendPersonalLuck20Description === 'function') sendPersonalLuck20Description(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('DUAL_main_')) {
      const uid = postbackData.replace('DUAL_main_', '');
      if (typeof sendDualMainDescription === 'function') sendDualMainDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('DUAL_ice_')) {
      const uid = postbackData.replace('DUAL_ice_', '');
      if (typeof sendDualIceDescription === 'function') sendDualIceDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('DUAL_heart_')) {
      const uid = postbackData.replace('DUAL_heart_', '');
      if (typeof sendDualHeartDescription === 'function') sendDualHeartDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('DUAL_wuxing_')) {
      const uid = postbackData.replace('DUAL_wuxing_', '');
      if (typeof sendDualWuXingDescription === 'function') sendDualWuXingDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('DUAL_emotion_')) {
      const uid = postbackData.replace('DUAL_emotion_', '');
      if (typeof sendDualEmotionDescription === 'function') sendDualEmotionDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PARENT_main_')) {
      const uid = postbackData.replace('PARENT_main_', '');
      if (typeof sendParentMainDescription === 'function') sendParentMainDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PARENT_ice_')) {
      const uid = postbackData.replace('PARENT_ice_', '');
      if (typeof sendParentIceDescription === 'function') sendParentIceDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PARENT_heart_')) {
      const uid = postbackData.replace('PARENT_heart_', '');
      if (typeof sendParentHeartDescription === 'function') sendParentHeartDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PARENT_dual_main_')) {
      const uid = postbackData.replace('PARENT_dual_main_', '');
      if (typeof sendParentDualMainDescription === 'function') sendParentDualMainDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PARENT_dual_ice_')) {
      const uid = postbackData.replace('PARENT_dual_ice_', '');
      if (typeof sendParentDualIceDescription === 'function') sendParentDualIceDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PARENT_dual_heart_')) {
      const uid = postbackData.replace('PARENT_dual_heart_', '');
      if (typeof sendParentDualHeartDescription === 'function') sendParentDualHeartDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PRODUCT_ice_')) {
      const uid = postbackData.replace('PRODUCT_ice_', '');
      if (typeof sendProductIceDescription === 'function') sendProductIceDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PRODUCT_heart_')) {
      const uid = postbackData.replace('PRODUCT_heart_', '');
      if (typeof sendProductHeartDescription === 'function') sendProductHeartDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PRODUCT_deal_')) {
      const uid = postbackData.replace('PRODUCT_deal_', '');
      if (typeof sendProductDealDescription === 'function') sendProductDealDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PRODUCT_extra_')) {
      const uid = postbackData.replace('PRODUCT_extra_', '');
      if (typeof sendProductExtraDescription === 'function') sendProductExtraDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('SERVICE_ice_')) {
      const uid = postbackData.replace('SERVICE_ice_', '');
      if (typeof sendServiceIceDescription === 'function') sendServiceIceDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('SERVICE_heart_')) {
      const uid = postbackData.replace('SERVICE_heart_', '');
      if (typeof sendServiceHeartDescription === 'function') sendServiceHeartDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('SERVICE_deal_')) {
      const uid = postbackData.replace('SERVICE_deal_', '');
      if (typeof sendServiceDealDescription === 'function') sendServiceDealDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('SERVICE_extra_')) {
      const uid = postbackData.replace('SERVICE_extra_', '');
      if (typeof sendServiceExtraDescription === 'function') sendServiceExtraDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('FINANCE_ice_')) {
      const uid = postbackData.replace('FINANCE_ice_', '');
      if (typeof sendFinanceIceDescription === 'function') sendFinanceIceDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('FINANCE_heart_')) {
      const uid = postbackData.replace('FINANCE_heart_', '');
      if (typeof sendFinanceHeartDescription === 'function') sendFinanceHeartDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('FINANCE_deal_')) {
      const uid = postbackData.replace('FINANCE_deal_', '');
      if (typeof sendFinanceDealDescription === 'function') sendFinanceDealDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('FINANCE_extra_')) {
      const uid = postbackData.replace('FINANCE_extra_', '');
      if (typeof sendFinanceExtraDescription === 'function') sendFinanceExtraDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('INSURE_ice_')) {
      const uid = postbackData.replace('INSURE_ice_', '');
      if (typeof sendInsureIceDescription === 'function') sendInsureIceDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('INSURE_heart_')) {
      const uid = postbackData.replace('INSURE_heart_', '');
      if (typeof sendInsureHeartDescription === 'function') sendInsureHeartDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('INSURE_deal_')) {
      const uid = postbackData.replace('INSURE_deal_', '');
      if (typeof sendInsureDealDescription === 'function') sendInsureDealDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('INSURE_extra_')) {
      const uid = postbackData.replace('INSURE_extra_', '');
      if (typeof sendInsureExtraDescription === 'function') sendInsureExtraDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('ESTATE_ice_')) {
      const uid = postbackData.replace('ESTATE_ice_', '');
      if (typeof sendEstateIceDescription === 'function') sendEstateIceDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('ESTATE_heart_')) {
      const uid = postbackData.replace('ESTATE_heart_', '');
      if (typeof sendEstateHeartDescription === 'function') sendEstateHeartDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('ESTATE_deal_')) {
      const uid = postbackData.replace('ESTATE_deal_', '');
      if (typeof sendEstateDealDescription === 'function') sendEstateDealDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('ESTATE_extra_')) {
      const uid = postbackData.replace('ESTATE_extra_', '');
      if (typeof sendEstateExtraDescription === 'function') sendEstateExtraDescription(uid, replyToken);

    } else if (postbackData && postbackData.startsWith('PARTNER_more_')) {
      const uid = postbackData.replace('PARTNER_more_', '');
      const level = (typeof getMemberLevel === 'function') ? getMemberLevel(uid) : '';
      const flexMsg = { type: 'flex', altText: '夥伴更多能力碼', contents: makeFlexMenuPartnerMore(uid, level) };
      replyMessage(replyToken, [flexMsg]);

    } else if (postbackData && postbackData.startsWith('PARTNER_code')) {
      const arr = postbackData.split('_');
      const codeIdx = parseInt(arr[1].replace('code', ''));
      const uid = arr[2];
      if (typeof sendPartnerCodeDescription === 'function') sendPartnerCodeDescription(uid, codeIdx, replyToken);

    } else if (userMessage === '查詢分級') {
      const level = (typeof getMemberLevel === 'function') ? getMemberLevel(userId) : '';
      const rightsMsg =
        "【會員等級權限說明】\n" +
        "🔹 免費會員：個人主性格簡易報告、每日抽卡\n" +
        "🔸 銅級會員：完整個人測驗無限次、每日抽卡\n" +
        "🌟 銀級會員：解鎖個人/雙人/親子測驗、每日抽卡、每月運勢提醒、每月直播通知\n" +
        "🏅 金級會員：解鎖所有分析測驗、每日抽卡、每月運勢提醒、每月直播通知\n" +
        "💎 鑽級會員：解鎖所有分析測驗、每日抽卡、每月運勢提醒、每月直播通知、每月諮詢1次、VIP老師群組、功能優先體驗";
      replyMessage(replyToken, [
        { type: 'text', text: `你目前的會員等級為：${level}` },
        { type: 'text', text: rightsMsg }
      ]);
    }

    // ★ 一律回 200 OK，避免 LINE 重試
    return ContentService.createTextOutput('OK');

  } catch (err) {
    Logger.log('❌ Error in doPost: ' + err);
    return ContentService.createTextOutput('OK');
  }
}

function onFollow(event) {
  try {
    const uid = event?.source?.userId;

    // ✅ 改為「點擊才暖」：首次事件也丟一次暖機（不阻塞回覆）
    try { if (uid) hotOnDemandKick(uid); } catch(_) {}

    if (!uid) return;

    // 先把狀態與等級放進 UserCache
    const uc = CacheService.getUserCache();
    uc.put(uid + '_level', '免費會員', UCACHE_TTL_MED);
    uc.put(uid + '_state', 'ROUTE_PERSONAL', 600);

    // ✅ 保底：立即寫入會員清單一列（避免只 follow 就消失）
    ensureMemberRowInline(uid);

    // 進佇列（背景補齊 name/流年/route 等）
    enqueueWriteJob(uid, { member: { route: 'FOLLOW' } });

    // ✅ 立刻就地微刷這個 uid（不用等排程；省 GAS 且體感快）
    try { microFlushIfUserHasJob(uid); } catch (_) {}

    // 歡迎卡（有 replyToken 才回）
    if (event.replyToken) {
      replyMessage(event.replyToken, [
        { type: 'text', text: '歡迎加入！先來一次個人解析吧👇' },
        buildBirthdayFlex({
          header: '請輸入生日',
          isCustomer: false,
          initial: '2000-01-01',
          min: '1920-01-01',
          max: '2025-12-31'
        })
      ]);
    }
  } catch (e) {
    Logger.log('onFollow error: ' + e);
  }
}

// ===== Cache warmers (merged single source of truth) =====
function warmAllCaches() {
  try {
    // 內容表：全部預熱
    TABLES.MAIN_PAID(); TABLES.ICE_HEART(); TABLES.WUXING();
    TABLES.EMOTION();   TABLES.FLOW();      TABLES.LUCK20();
    TABLES.PROD();      TABLES.SERV();      TABLES.FIN();
    TABLES.INS();       TABLES.ESTATE();    TABLES.UNION81();

    // 快速查找所需索引也一併建立
    getMemberIndex();
    getIndexByUid_A('運算紀錄表');
    getIndexByUid_A('聯合碼紀錄表');
    getIndexByUid_B('雙人配對運算紀錄表');
  } catch (e) {
    Logger.log('warmAllCaches error: ' + e);
  }
}

function _maybeWarmToday() {
  const ps = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd');
  const LAST_KEY = 'warm_last';   // 只用這一個 key

  // 已預熱過就略過
  if (ps.getProperty(LAST_KEY) === today) return;

  // 防止多人同時觸發造成重複預熱
  const lock = LockService.getScriptLock();
  try { lock.tryLock(500); } catch (_) {}

  try {
    if (ps.getProperty(LAST_KEY) === today) return; // 再檢一次
    warmAllCaches();
    ps.setProperty(LAST_KEY, today);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function handleWooOrder(payload){
  if(!payload) return;

  var status  = String(payload.status  || '').toLowerCase().trim();
  var uid     = String(payload.line_uid || '').trim();
  var orderId = String(payload.order_id || '').trim();
  if(!uid){ Logger.log('Missing line_uid: ' + JSON.stringify(payload)); return; }

  // 冪等：order_id + status 重覆不處理（以 Woo紀錄 第 9 欄 applied=Y 為準）
  var logSheet = SpreadsheetApp.getActive().getSheetByName('Woo紀錄') || SpreadsheetApp.getActive().insertSheet('Woo紀錄');
  var rows = logSheet.getDataRange().getValues();
  if(!rows.length){
    logSheet.appendRow(['時間','order_id','status','uid','items_json','total','email','結果_json','applied']);
    rows = logSheet.getDataRange().getValues();
  }
  var applied = rows.some(function(r){
    return String(r[1])===orderId && String(r[2])===status && String(r[8])==='Y';
  });
  if(applied){ Logger.log('Already applied: ' + orderId + ' ' + status); return; }

  // 僅處理允許狀態
  var OK_STATUSES = ['processing','completed']; // 若要加入 on-hold，推入即可
  if(OK_STATUSES.indexOf(status) === -1){
    logWooEvent(payload, {note:'ignored status', status: status}, false);
    return;
  }

  // 建立商品對應：product_id、sku 兩條路都能對應
  var tableMap = getTableMapCached('商品對應表', 0); // key=product_id
  var skuMap = {};
  Object.keys(tableMap).forEach(function(pid){
    var r = tableMap[pid];
    var sku = String(r[1] || '').trim();
    if(sku) skuMap[sku] = r;
  });

  var LEVEL_RANK = {'免費會員':0,'銅級會員':1,'銀級會員':2,'金級會員':3,'鑽級會員':4};
  var maxRank = 0, finalLevel = null;
  var extendMonths = 0, extendDays = 0;
  var matched = [], unmatched = [];

  (payload.items || []).forEach(function(it){
    var pid = String(it.product_id || '').trim();
    var sku = String(it.sku || '').trim();
    var row = tableMap[pid] || skuMap[sku];
    if(!row){ unmatched.push({pid:pid, sku:sku, qty:it.qty}); return; }

    matched.push({pid:pid, sku:sku});
    var level  = String(row[2] || '免費會員').trim();
    var months = parseInt(row[3] || 0, 10) * (parseInt(it.qty || 1, 10) || 1);
    var days   = parseInt(row[4] || 0, 10) * (parseInt(it.qty || 1, 10) || 1);

    extendMonths += months;
    extendDays   += days;

    var r = LEVEL_RANK[level] || 0;
    if(r > maxRank){ maxRank = r; finalLevel = level; }
  });

  if(!finalLevel && extendMonths===0 && extendDays===0){
    logWooEvent(payload, {note:'no applicable items', unmatched: unmatched, items: payload.items}, false);
    return;
  }

  // ===== 合併 I/O：會員清單寫入（A..D 一次讀/寫） =====
  var sh = SpreadsheetApp.getActive().getSheetByName('會員清單');
  var idxMap = getMemberIndex();
  var rowNum = idxMap[normalizeKey(uid)];

  if(!rowNum){
    // 先建列但不抓名（C 欄留空）；背景再補
    sh.appendRow([null, uid, '', '免費會員', '', '', 'WOOCHECKOUT', '']);
    rowNum = sh.getLastRow();
    updateMemberIndex(uid, rowNum);

    // 交給背景補齊（名稱/流年/路由等）
    enqueueWriteJob(uid, { member: {} });
  }

  var now  = new Date();
  var cur  = sh.getRange(rowNum, 1).getValue(); // A 欄：到期日
  var base = (cur && cur instanceof Date && cur > now) ? new Date(cur) : new Date(now);

  if(extendMonths > 0) base.setMonth(base.getMonth() + extendMonths);
  if(extendDays   > 0) base.setDate(base.getDate() + extendDays);

  var rowAtoD = sh.getRange(rowNum, 1, 1, 4).getValues()[0]; // 讀 A..D
  rowAtoD[0] = base;                         // A 到期
  if (finalLevel) rowAtoD[3] = finalLevel;   // D Level
  sh.getRange(rowNum, 1, 1, 4).setValues([rowAtoD]); // 一次寫回

  refreshMemberLevelCache(uid);

  // 推送通知
  var levelNow = rowAtoD[3];
  _safeSendPush(uid,
    '感謝你的購買！已升級為「' + levelNow + '」，到期日：' +
    base.getFullYear() + '-' + (base.getMonth()+1) + '-' + base.getDate() +
    '。\n在輸入一次測驗即可使用最新權限。'
  );

  // 記錄並標記 applied=Y
  logWooEvent(payload, {
    appliedLevel: finalLevel,
    months: extendMonths,
    days: extendDays,
    expire: base,
    matched: matched,
    unmatched: unmatched
  }, true);
}

// Woo 記錄表（最後一欄 applied 會寫入 'Y' 代表已應用）
function logWooEvent(payload, result, applied){
  var sh = SpreadsheetApp.getActive().getSheetByName('Woo紀錄');
  if(!sh){
    sh = SpreadsheetApp.getActive().insertSheet('Woo紀錄');
    sh.appendRow(['時間','order_id','status','uid','items_json','total','email','結果_json','applied']);
  }
  sh.appendRow([
    new Date(),
    payload.order_id || '',
    payload.status   || '',
    payload.line_uid || '',
    JSON.stringify(payload.items || []),
    payload.total || '',
    payload.email || '',
    JSON.stringify(result || {}),
    applied ? 'Y' : ''
  ]);
}

/******** (可選) LIFF 橋連結產生：給「前往商店」按鈕用 ********/
const BRIDGE_URL = 'https://relhroom.com/liff-bridge/';
const DEFAULT_REDIRECT = 'https://relhroom.com/system-lite/';
function makeLiffBridgeUrl(redirectUrl, source = 'menu_default'){
  const r = redirectUrl || DEFAULT_REDIRECT;
  const withSrc = r + (r.includes('?') ? '&' : '?') + 'src=' + encodeURIComponent(source);
  return BRIDGE_URL + '?redirect=' + encodeURIComponent(withSrc);
}

function sendPushToUser(uid, message) {
  const CHANNEL_TOKEN = PropertiesService.getScriptProperties().getProperty('CHANNEL_TOKEN');
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CHANNEL_TOKEN },
    payload: JSON.stringify({
      to: uid,
      messages: [{ type: 'text', text: message }]
    })
  });
}

// 每日抽卡優化（內容也快取，hash 寫法，批次寫表新方案）
function handleDailyDrawImageFast(userId, replyToken, cache) {
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const cacheKey = userId + '_draw_' + today;
  let drawText = cache.get(cacheKey);

  if (!drawText) {
    // 抽卡內容全表快取一天
    const scriptCache = CacheService.getScriptCache();
    let drawList = scriptCache.get('drawCardList');
    if (!drawList) {
      const sheetDraw = SpreadsheetApp.getActive().getSheetByName('抽卡內容');
      drawList = sheetDraw.getRange(2, 2, sheetDraw.getLastRow()-1, 1).getValues().map(r=>r[0]);
      scriptCache.put('drawCardList', JSON.stringify(drawList), 86400);
    } else {
      drawList = JSON.parse(drawList);
    }
    // 用 userId+日期 雜湊 index，確保同一人同一天同一張
    const key = userId + today;
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
    const idx = Math.abs(hash) % drawList.length;
    drawText = drawList[idx];
    cache.put(cacheKey, drawText, 86400);
  }
  replyHealingFlexDrawCard(replyToken, drawText);
  // 批次寫入暫存，等每天23:50統一寫表
  saveDrawRecordToBatch(userId, today);
}

// 抽卡批次暫存寫入（存進 PropertiesService dailyDrawRecords）
function saveDrawRecordToBatch(userId, today) {
  const ps = PropertiesService.getScriptProperties();
  let record = ps.getProperty('dailyDrawRecords');
  let data = record ? JSON.parse(record) : {};
  data[userId] = today; // 僅記錄最新一次
  ps.setProperty('dailyDrawRecords', JSON.stringify(data));
}

// 每天 23:50 批次將所有抽卡資料寫入會員清單 I欄
function batchWriteDrawRecord() {
  const ps = PropertiesService.getScriptProperties();
  let record = ps.getProperty('dailyDrawRecords');
  if (!record) return;
  let data = JSON.parse(record);
  const sheet = SpreadsheetApp.getActive().getSheetByName('會員清單');
  const uidList = sheet.getRange(2, 2, sheet.getLastRow()-1, 1).getValues().flat();
  Object.keys(data).forEach(userId => {
    const row = uidList.indexOf(userId);
    if (row >= 0) sheet.getRange(row+2, 9).setValue(data[userId]);
  });
  ps.deleteProperty('dailyDrawRecords'); // 清空暫存
}

// 推播療癒風 Flex 卡片
function replyHealingFlexDrawCard(replyToken, drawText) {
  var CHANNEL_TOKEN = PropertiesService.getScriptProperties().getProperty('CHANNEL_TOKEN');
  var bubble = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      backgroundColor: '#FFF6EE', // 柔和杏色底
      contents: [
        {
          type: 'text',
          text: '💛 今日療癒卡片',
          weight: 'bold',
          size: 'xl',
          align: 'center',
          color: '#ffb45c',
          margin: 'md'
        },
        {
          type: 'text',
          text: drawText,
          wrap: true,
          size: 'md',
          align: 'center',
          color: '#8d6e63',
          margin: 'lg'
        },
        {
          type: 'text',
          text: '— 來自SUN哥的每日祝福',
          size: 'sm',
          color: '#bca190',
          align: 'center',
          margin: 'xl'
        }
      ]
    },
    styles: {
      body: {
        backgroundColor: '#FFF6EE'
      }
    }
  };
  var payload = {
    replyToken: replyToken,
    messages: [
      {
        type: 'flex',
        altText: '今日療癒卡片已送達！',
        contents: bubble
      }
    ]
  };
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CHANNEL_TOKEN
    },
    'method': 'post',
    'payload': JSON.stringify(payload)
  });
}

function onFormSubmit(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('會員清單');
  const values = e.values;
  const uid = values[1];
  const addPeriod = values[2];
  const level = values[3];

  const monthMap = {
    "3天": 0.1,
    "1個月": 1,
    "3個月": 3,
    "6個月": 6,
    "1年": 12
  };
  const addMonths = monthMap[addPeriod];
  if (!addMonths) return;

  const data = sheet.getDataRange().getValues();
  const row = data.findIndex(r => r[1] === uid);
  if (row === -1) return;

  const now = new Date();
  let baseDate = now;
  if (data[row][0] && !isNaN(new Date(data[row][0])) && new Date(data[row][0]) > now) {
    baseDate = new Date(data[row][0]);
  }

  if (addPeriod === "3天") {
    baseDate.setDate(baseDate.getDate() + 3); // 加三天
  } else {
    baseDate.setMonth(baseDate.getMonth() + addMonths);
  }

  sheet.getRange(row + 1, 1).setValue(baseDate); // 權限到期時間（第1欄）
  sheet.getRange(row + 1, 4).setValue(level);    // 會員等級（第4欄）

  refreshMemberLevelCache(uid); // ★ 新增：同步更新 UserCache 的等級

  sendPushToUser(uid, `你的會員已升級為「${level}」，到期日：${baseDate.getFullYear()}-${baseDate.getMonth() + 1}-${baseDate.getDate()}。\n感謝支持！再次點選測驗即可享受最新服務!`);
}

function checkAndDowngradeExpiredMembers() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('會員清單');
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    let expire = data[i][0];
    let uid = data[i][1];
    let level = data[i][3];

    if (level !== '免費會員' && expire && new Date(expire) < now) {
      sheet.getRange(i + 1, 4).setValue('免費會員');

      // ★ 新增：同步更新 UserCache 的等級
      CacheService.getUserCache().put(uid + '_level', '免費會員', UCACHE_TTL_MED);

      sendPushToUser(uid, '你的會員已到期，已自動降級為免費會員。如需繼續享有完整權益，請立即升級。');
    }
  }
}

function handleBirthday(userId, replyToken, birthday, userState, cache) {
  // ★ JIT：當使用者送出生日時，強制同步會員等級（避免讀到 30 分鐘前的舊快取）
  try { refreshMemberLevelCache(userId); } catch (_) {}

  const routeA = ['ROUTE_PERSONAL','ROUTE_PRODUCT','ROUTE_SERVICE','ROUTE_FINANCE','ROUTE_INSURE','ROUTE_ESTATE','ROUTE_PARTNER'];

  // ===== 單人路徑（個人/商品/服務/金融/保險/不動產/夥伴）=====
  if (routeA.includes(userState)) {
    // 1) 計算（本機）
    const sixteen = calculateSixteenNumbers(birthday);
    const union12 = calculateUnionCodes16Map(sixteen);

    // 2) 先回覆 UI（不等待寫表）
    const level = getMemberLevel(userId); // ← 這裡會讀到剛同步好的最新等級
    let menu;
    switch (userState) {
      case 'ROUTE_PERSONAL': menu = makeFlexMenuPersonal(userId, level); break;
      case 'ROUTE_PRODUCT' : menu = makeFlexMenuProduct(userId, level);  break;
      case 'ROUTE_SERVICE' : menu = makeFlexMenuService(userId, level);  break;
      case 'ROUTE_FINANCE' : menu = makeFlexMenuFinance(userId, level);  break;
      case 'ROUTE_INSURE'  : menu = makeFlexMenuInsure(userId, level);   break;
      case 'ROUTE_ESTATE'  : menu = makeFlexMenuEstate(userId, level);   break;
      case 'ROUTE_PARTNER' : menu = makeFlexMenuPartnerFirst(userId, level); break;
      default:               menu = makeFlexMenuPersonal(userId, level);
    }
    const confirmMsg = { type: 'text', text: `你輸入的生日為：${birthday}` };
    const flexMsg    = { type: 'flex', altText: '請選擇解析項目', contents: menu };
    replyMessage(replyToken, [confirmMsg, flexMsg]);
    cache.remove(userId + '_state');

    // 3) 讓後續 postback 立刻可用（把結果放進 UserCache）
    primeUserCachesAfterCalc(userId, sixteen, union12, null);

    // ★ 當下把「今年流年」快取起來（不等寫表）
    const flowNumNow = _computeFlowNumFromBirthday(birthday);
    if (flowNumNow != null) {
      CacheService.getUserCache().put(userId + '_flow', String(flowNumNow), UCACHE_TTL_SHORT);
    }

    // 4) 寫表改成「排隊」
    enqueueWriteJob(userId, {
      member: { b1: birthday, b2: '', route: userState },
      calc:   sixteen,
      union:  union12
    });
    return;
  }

  // ===== 伴侶：兩步輸入 =====
  if (userState === 'ROUTE_DUAL_1') {
    cache.put(userId + '_dual_b1', birthday, 600);
    cache.put(userId + '_state', 'ROUTE_DUAL_2', 600);
    const confirmMsg = { type: 'text', text: `你輸入的第一位對象生日為：${birthday}` };
    const menuMsg = getDualBirthdayPrompt(2);
    replyMessage(replyToken, [confirmMsg, menuMsg]);
    return;
  }
  if (userState === 'ROUTE_DUAL_2') {
    const b1 = cache.get(userId + '_dual_b1');
    const b2 = birthday;
    const nA = calculateSevenNumbers(b1);
    const nB = calculateSevenNumbers(b2);

    // ✅ 先把 pairRow 丟進 UserCache，menu 立刻讀得到（不等寫表）
    const EMPTY16 = {n1:0,n2:0,n3:0,n4:0,n5:0,n6:0,n7:0,n8:0,n9:0,n10:0,n11:0,n12:0,n13:0,n14:0,n15:0,n16:0};
    const pairRow = buildPairRow(userId, b1, b2, nA, nB);
    primeUserCachesAfterCalc(userId, EMPTY16, [], pairRow);

    // 再回覆選單（會讀到剛同步的等級）
    const level = getMemberLevel(userId);
    replyMessage(replyToken, [
      { type: 'text', text: `你輸入的兩位生日分別為：${b1} 和 ${b2}` },
      { type: 'flex', altText: '雙人配對分析', contents: makeFlexMenuDual(userId, level) }
    ]);
    cache.remove(userId + '_state'); cache.remove(userId + '_dual_b1');

    // 寫表交給佇列（背景處理）
    enqueueWriteJob(userId, { pair: { b1, b2, nA, nB } });
    return;
  }

  // ===== 親子：兩步輸入 =====
  if (userState === 'ROUTE_PARENT_1') {
    cache.put(userId + '_parent_b1', birthday, 600);
    cache.put(userId + '_state', 'ROUTE_PARENT_2', 600);
    const confirmMsg = { type: 'text', text: `你輸入的孩子生日為：${birthday}` };
    const menuMsg = sendParentBirthdayPrompt(replyToken, 2);
    replyMessage(replyToken, [confirmMsg, menuMsg]);
    return;
  }
  if (userState === 'ROUTE_PARENT_2') {
    const b1 = cache.get(userId + '_parent_b1'); // 孩子
    const b2 = birthday;                          // 家長
    const nA = calculateSevenNumbers(b1);
    const nB = calculateSevenNumbers(b2);

    // ✅ 先把 pairRow 丟進 UserCache，menu 立刻讀得到（不等寫表）
    const EMPTY16 = {n1:0,n2:0,n3:0,n4:0,n5:0,n6:0,n7:0,n8:0,n9:0,n10:0,n11:0,n12:0,n13:0,n14:0,n15:0,n16:0};
    const pairRow = buildPairRow(userId, b1, b2, nA, nB);
    primeUserCachesAfterCalc(userId, EMPTY16, [], pairRow);

    // 再回覆選單（會讀到剛同步的等級）
    const level = getMemberLevel(userId);
    const messages = [
      { type: 'text', text: `你輸入的生日為：${b1}（孩子）和 ${b2}（家長）` },
      { type: 'flex', altText: '親子配對分析', contents: makeFlexMenuParent(userId, level) }
    ];
    replyMessage(replyToken, messages);
    cache.remove(userId + '_state'); cache.remove(userId + '_parent_b1');

    // 寫表交給佇列（背景處理）
    enqueueWriteJob(userId, { pair: { b1, b2, nA, nB } });
    return;
  }
}

function isValidBirthday(text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text);
}

/** ================== 覆蓋：sendBirthdayInputPrompt ================== **/
function sendBirthdayInputPrompt(replyToken, userState) {
  const customerRoutes = ['ROUTE_PRODUCT','ROUTE_SERVICE','ROUTE_FINANCE','ROUTE_INSURE','ROUTE_ESTATE'];
  const isCustomer = customerRoutes.includes(userState);
  const header = isCustomer ? '請輸入客戶生日' : '請輸入生日';

  const manualMsg = isCustomer
    ? '請輸入客戶生日（格式：YYYY-MM-DD）'
    : '請輸入生日（格式：YYYY-MM-DD）';

  const sc = CacheService.getScriptCache();

  // ✅ 快速版：Template Buttons（payload 小、渲染快）
  if (useFastUi_()) {
    const ck = `ui:btn:bday:${isCustomer?'C':'U'}`;
    const msg = cacheJsonBuild_(sc, ck, 86400, () => buildBirthdayButtonsPrompt_({
      header,
      manualMsg,
      initial: '2000-01-01',
      min: '1920-01-01',
      max: '2025-12-31'
    }));
    replyMessage(replyToken, [msg]);
    return;
  }

  // ✅ 美感版：Flex（沿用你原本 buildBirthdayFlex）
  const ck = `ui:flex:bday:${isCustomer?'C':'U'}`;
  const msg = cacheJsonBuild_(sc, ck, 86400, () => buildBirthdayFlex({
    header,
    isCustomer,
    initial: '2000-01-01',
    min: '1920-01-01',
    max: '2025-12-31'
  }));
  replyMessage(replyToken, [msg]);
}

/** ================== 覆蓋：sendParentBirthdayPrompt ================== **/
function sendParentBirthdayPrompt(replyToken, step) {
  const who = (step === 1) ? '孩子' : '家長';
  const header = `請輸入${who}的生日`;
  const manualMsg = `請輸入${who}的生日（格式：YYYY-MM-DD）`;

  const sc = CacheService.getScriptCache();

  if (useFastUi_()) {
    const ck = `ui:btn:parent:${step}`;
    return cacheJsonBuild_(sc, ck, 86400, () => buildBirthdayButtonsPrompt_({
      header,
      manualMsg,
      initial: (step === 1) ? '2015-01-01' : '2000-01-01',
      min: '1950-01-01',
      max: '2025-12-31'
    }));
  }

  const ck = `ui:flex:parent:${step}`;
  return cacheJsonBuild_(sc, ck, 86400, () => buildBirthdayFlex({
    header,
    isCustomer: false,
    initial: (step === 1) ? '2015-01-01' : '2000-01-01',
    min: '1950-01-01',
    max: '2025-12-31',
    manualText: manualMsg
  }));
}

/** ================== 覆蓋：getDualBirthdayPrompt ================== **/
function getDualBirthdayPrompt(step) {
  const person = (step === 1) ? '第一位對象' : '第二位對象';
  const header = `請輸入${person}的生日`;
  const manualMsg = `請輸入${person}的生日（格式：YYYY-MM-DD）`;

  const sc = CacheService.getScriptCache();

  if (useFastUi_()) {
    const ck = `ui:btn:dual:${step}`;
    return cacheJsonBuild_(sc, ck, 86400, () => buildBirthdayButtonsPrompt_({
      header,
      manualMsg,
      initial: '2000-01-01',
      min: '1920-01-01',
      max: '2025-12-31'
    }));
  }

  const ck = `ui:flex:dual:${step}`;
  return cacheJsonBuild_(sc, ck, 86400, () => buildBirthdayFlex({
    header,
    isCustomer: false,
    initial: '2000-01-01',
    min: '1920-01-01',
    max: '2025-12-31',
    manualText: manualMsg
  }));
}

function calculateSevenNumbers(birthday) {
  const [y, m, d] = birthday.split('-').map(n => parseInt(n));

  const n1 = compressNumber(d);                         // 日期相加（如 24 → 2+4=6）
  const n2 = compressNumber(m);                         // 月份相加（如 11 → 1+1=2）
  const n3 = compressNumber(parseInt(String(y).slice(0, 2))); // 年前兩碼（如 19 → 1+9=10 → 1）

  let ySuffix = parseInt(String(y).slice(2));
  let n4Raw = ySuffix;
  if (ySuffix === 0) {
    n4Raw = 5; // 特例規則 00 = 5
  }
  const n4 = compressNumber(n4Raw);                     // 年後兩碼

  const n5 = compressNumber(n1 + n2);
  const n6 = compressNumber(n3 + n4);
  const n7 = compressNumber(n5 + n6);                   // 主性格數

  return { n1, n2, n3, n4, n5, n6, n7 };
}

// 進位壓縮到個位數（1~9）
function compressNumber(num) {
  while (num > 9) {
    num = num.toString().split('').reduce((sum, d) => sum + parseInt(d), 0);
  }
  return num;
}

const PARTNER_CODE_LABELS = [
  "工作能力與世界觀",         
  "家庭互動與情緒安全",         
  "人生定位與最終渴望",         
  "行動力與外在責任擴張",       
  "人際整合與多元觀察",         
  "青壯期人際互動（20–40歲）",  
  "專業與掌控（成熟內化）",     
  "內外整合與角色轉化橋梁",     
  "中年事業成就（40–60歲）",    
  "情感系統預備與備援",         
  "家庭邊界與情緒穩定",         
  "老年期家庭與財富整合（60歲以上）" 
];

/** 計算 16 數序列（使用七數延伸） **/
function calculateSixteenNumbers(birthday) {
  const s = calculateSevenNumbers(birthday);
  const n1 = s.n1, n2 = s.n2, n3 = s.n3, n4 = s.n4;
  const n5 = s.n5, n6 = s.n6, n7 = s.n7;
  const n8  = compressNumber(n1 + n5);
  const n9  = compressNumber(n2 + n5);
  const n10 = compressNumber(n8 + n9);
  const n11 = compressNumber(n6 + n7);
  const n12 = compressNumber(n5 + n7);
  const n13 = compressNumber(n11 + n12);
  const n14 = compressNumber(n3 + n6);
  const n15 = compressNumber(n4 + n6);
  const n16 = compressNumber(n14 + n15);
  return {
    ...s,
    n8, n9, n10, n11, n12, n13, n14, n15, n16
  };
}

// 計算12組聯合碼（根據 16 數 JOINT_CODE_INDEXES 指定位置組合壓縮）
function calculateUnionCodes16Map(sixteen) {
  const combos = [
    ['n1','n2','n5'],   // 1
    ['n3','n4','n6'],   // 2
    ['n5','n6','n7'],   // 3
    ['n1','n5','n8'],   // 4
    ['n2','n5','n9'],   // 5
    ['n8','n9','n10'],  // 6
    ['n6','n7','n11'],  // 7
    ['n5','n7','n12'],  // 8
    ['n11','n12','n13'],// 9
    ['n3','n6','n14'],  // 10
    ['n4','n6','n15'],  // 11
    ['n14','n15','n16'] // 12
  ];
  return combos.map(keys => `${sixteen[keys[0]]}${sixteen[keys[1]]}${sixteen[keys[2]]}`);
}

function writeUnionCodes(uid, codes) {
  const sh = SpreadsheetApp.getActive().getSheetByName('聯合碼紀錄表');
  const idxMap = getIndexByUid_A('聯合碼紀錄表');           // A=uid 的索引
  let rowNum = idxMap[normalizeKey(uid)];
  const row = [uid, ...codes];

  if (!rowNum) {
    sh.appendRow(row);
    rowNum = sh.getLastRow();
    // 更新索引快取（避免下一次又全掃）
    const sc = CacheService.getScriptCache();
    const CK = 'idx:聯合碼紀錄表:A';
    const cur = _getJson(sc, CK) || {};
    cur[normalizeKey(uid)] = rowNum;
    _putJson(sc, CK, cur, SCACHE_TTL_LONG);
  } else {
    sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
  }

  // 讓後續 postback 不用等寫表就能讀到
  const uc = CacheService.getUserCache();
  _putJson(uc, 'unionRow:' + uid, row, UCACHE_TTL_SHORT);
}

function writeSixteenNumbers(uid, sixteen) {
  const sh = SpreadsheetApp.getActive().getSheetByName('運算紀錄表');
  const idxMap = getIndexByUid_A('運算紀錄表');             // A=uid 的索引
  let rowNum = idxMap[normalizeKey(uid)];

  const row = [uid];
  for (let i = 1; i <= 16; i++) row.push(sixteen['n' + i]);

  if (!rowNum) {
    sh.appendRow(row);
    rowNum = sh.getLastRow();
    const sc = CacheService.getScriptCache();
    const CK = 'idx:運算紀錄表:A';
    const cur = _getJson(sc, CK) || {};
    cur[normalizeKey(uid)] = rowNum;
    _putJson(sc, CK, cur, SCACHE_TTL_LONG);
  } else {
    sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
  }

  // 先把結果放進使用者快取，讓後續查詢立即可用
  const uc = CacheService.getUserCache();
  _putJson(uc, 'calcRow:' + uid, row, UCACHE_TTL_SHORT);
}

function sendDualBirthdayPrompt(replyToken, step) {
  const person = step === 1 ? '第一位對象' : '第二位對象';
  const msg = {
    type: 'template',
    altText: `請輸入${person}的生日`,
    template: {
      type: 'buttons',
      text: `        請輸入${person}的生日\n       (資料庫龐大，點按請稍等)`,
      actions: [
        {
          type: 'message',
          label: '手動輸入生日',
          text: `請輸入${person}的生日（格式：YYYY-MM-DD）`
        },
        {
          type: 'datetimepicker',
          label: '快速選單',
          data: 'action=birthday_quick',
          mode: 'date',
          initial: '2000-01-01',
          min: '1920-01-01',
          max: '2025-12-31'
        }
      ]
    }
  };
  replyMessage(replyToken, [msg]);
}

function getWuXingByN7(n7) {
  const map = TABLES.WUXING();
  const row = map[String(n7)];
  return row ? row[1] : '';
}

/** ▲ 新增：由生日算出「今年流年數」 */
function _computeFlowNumFromBirthday(b1, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b1)) return null;
  const thisYear = now.getFullYear();
  const [, mm, dd] = b1.split('-');
  return calculateSevenNumbers(`${thisYear}-${mm}-${dd}`).n7;
}

function getWuxingMatrixCached() {
  return getMatrixCached('戀愛五行表單', SCACHE_TTL_LONG);
}

/** ================== 覆蓋：writeDualPairRecord ================== **/
function writeDualPairRecord(uid, birthdayA, birthdayB, nA, nB) {
  const sheetName = '雙人配對運算紀錄表';
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const now = new Date();

  const wuXingA = getWuXingByN7(nA.n7);
  const wuXingB = getWuXingByN7(nB.n7);

  const row = [
    now, uid,
    birthdayA, birthdayB,
    nA.n1, nA.n4, nA.n7, wuXingA, nA.n7,
    nB.n1, nB.n4, nB.n7, wuXingB, nB.n7
  ];

  // ✅ O(1) 走索引（B=uid）
  const idxMap = getIndexByUid_B(sheetName);
  let rowNum = idxMap[normalizeKey(uid)];

  if (!rowNum) {
    sheet.appendRow(row);
    rowNum = sheet.getLastRow();
    updateIndexCache_(sheetName, 'B', uid, rowNum);
  } else {
    sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
  }

  // ✅ 更新使用者快取（讓後續 postback 立刻讀得到）
  _putJson(CacheService.getUserCache(), 'pairRow:' + uid, row, UCACHE_TTL_SHORT);

  // 若你仍希望保留「重算時清掉舊的個人快取」：
  invalidateUserComputedRows(uid);
}

function sendConfirmBirthday(replyToken, birthday) {
  replyMessage(replyToken, [{ type: 'text', text: `你輸入的生日為：${birthday}` }]);
}

function getMemberLevel(uid, cache = null) {
  // 向下相容舊呼叫
  return getMemberLevelFast(uid);
}

// [覆蓋] getUserDisplayName
function getUserDisplayName(uid, force = false) {
  const cache = CacheService.getUserCache();
  const ck = uid + '_name';
  if (!force) {
    const inCache = cache.get(ck);
    if (inCache) return inCache;
  }
  try {
    const pack = getMemberRowByUidFast(uid);
    if (pack && pack.row && pack.row.length >= 3) {
      const name = String(pack.row[2] || '').trim();
      if (name) { cache.put(ck, name, 86400); return name; }
    }
  } catch (_){}

  const prof = getLineProfileFast(uid);
  const name = prof.displayName || '';
  if (name) cache.put(ck, name, 86400);
  return name;
}

/** ================== 覆蓋：saveOrUpdateMember ================== **/
function saveOrUpdateMember(uid, name, b1, b2, route) {
  const sh = SpreadsheetApp.getActive().getSheetByName('會員清單');
  const idxMap = getMemberIndex();
  const key = normalizeKey(uid);
  let rowNum = idxMap[key];

  if (!name) name = getUserDisplayName(uid);

  // 計算今年流年（H 欄）
  let flowNum = '';
  if (b1 && /^\d{4}-\d{2}-\d{2}$/.test(b1)) {
    const now = new Date();
    const thisYear = now.getFullYear();
    const [, mm, dd] = b1.split('-');
    flowNum = calculateSevenNumbers(`${thisYear}-${mm}-${dd}`).n7;
  }

  if (!rowNum) {
    sh.appendRow([new Date(), uid, name || '', '免費會員', b1 || '', b2 || '', route || '', flowNum || '']);
    rowNum = sh.getLastRow();
    updateMemberIndex(uid, rowNum);
  } else {
    // ✅ 一次讀 A..H，一次寫回 A..H
    const rng = sh.getRange(rowNum, 1, 1, 8);
    const row = rng.getValues()[0];

    // row: [A建立/到期?, Buid, Cname, Dlevel, E b1, F b2, G route, H flow]
    if (name)  row[2] = name;
    if (b1)    row[4] = b1;
    if (b2)    row[5] = b2;
    if (route) row[6] = route;
    if (flowNum !== '') row[7] = flowNum;

    rng.setValues([row]);
  }

  // 同步快取
  if (name) CacheService.getUserCache().put(uid + '_name', String(name), 86400);
  if (flowNum !== '') CacheService.getUserCache().put(uid + '_flow', String(flowNum), UCACHE_TTL_MED);
}

function makeUpgradeUri(tier, source = 'menu_default') {
  const mapKey = tier === 'bronze' ? 'bronze_1m'
               : tier === 'silver' ? 'silver_1m'
               : tier === 'gold'   ? 'gold_1m'
               : 'default';
  const base = PLAN_REDIRECT_MAP[mapKey] || PLAN_REDIRECT_MAP.default;
  return makeLiffBridgeUrl(base, `upgrade_${source}`);
}

// 小標章（置中顯示）
function buildTag(text, color) {
  return { type: 'text', text, size: 'xs', align: 'center', color, margin: 'xs' };
}

// 狀態文案（全部置中）
function _infoLine({ locked, tier, isFreeMain }) {
  const WAIT_SOFT = '資料量較大\n載入約 2–3 秒';
  const colorTier = tier === 'bronze' ? BRAND.bronze : tier === 'silver' ? BRAND.silver : BRAND.gold;

  if (locked) return { text: '✨ 點擊解鎖，選購開通（自動升級）', color: colorTier };
  if (isFreeMain) return { text: FREE_MAIN_AFFIRM, color: BRAND.hint };
  return { text: WAIT_SOFT, color: BRAND.hint };
}

// 共用功能泡泡（所有文字置中；locked 一律帶「推薦」+ 等級小標章）
function buildFeatureBubble({
  label, desc, locked, tier,
  actionPostback, postbackDisplayText = '資料讀取中請稍後',
  srcTag, isFreeMain = false, extraBadge = null
}) {
  const tierLabel = tier === 'bronze' ? '銅級解鎖' : tier === 'silver' ? '銀級解鎖' : '金級解鎖';
  const tierColor = tier === 'bronze' ? BRAND.bronze : tier === 'silver' ? BRAND.silver : BRAND.gold;
  const info = _infoLine({ locked, tier, isFreeMain });

  const bodyContents = [
    { type: 'text', text: label, weight: 'bold', size: 'lg', align: 'center', color: BRAND.navy }
  ];

  // 額外標章（如：免費）
  if (extraBadge) bodyContents.push(buildTag(extraBadge.text, extraBadge.color));

  // 未解鎖 → 一律顯示【推薦】+ 等級小標章（皆置中）
  if (locked) {
    bodyContents.push(buildTag('推薦', BRAND.bronze));
    bodyContents.push(buildTag(tierLabel, tierColor));
  }

  bodyContents.push(
    { type: 'text', text: desc, align: 'center', size: 'xs', wrap: true, color: locked ? BRAND.hint : BRAND.body, margin: 'xs' },
    { type: 'text', text: info.text, size: 'xs', align: 'center', color: info.color, margin: 'sm', wrap: true }
  );

  return {
    type: 'bubble',
    size: 'micro',
    body: { type: 'box', layout: 'vertical', spacing: 'xs', contents: bodyContents },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        locked ? {
          type: 'button',
          style: 'primary',
          color: tierColor,
          action: { type: 'uri', label: tierLabel, uri: makeUpgradeUri(tier, `lock_${srcTag || 'item'}`) }
        } : {
          type: 'button',
          style: 'primary',
          color: BRAND.blue,
          action: { type: 'postback', label: '查看', data: actionPostback, displayText: postbackDisplayText }
        }
      ]
    }
  };
}

// 置頂福利泡泡（Upsell；全部置中）
function buildUpsellBubble({ tier, title, bullets = [], srcTag = 'upsell' }) {
  const color = tier === 'bronze' ? BRAND.bronze : tier === 'silver' ? BRAND.silver : BRAND.gold;
  return {
    type: 'bubble',
    size: 'micro',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'lg', align: 'center', color: BRAND.navy },
        ...bullets.map(t => ({ type: 'text', text: '・' + t, size: 'xs', color: BRAND.body, wrap: true, align: 'center' })),
        { type: 'text', text: '✨ 點擊解鎖立即開通', size: 'xs', align: 'center', color: color, margin: 'sm' }
      ]
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'button', style: 'primary', color: color,
          action: { type: 'uri', label: (tier==='bronze'?'立即升級銅級':tier==='silver'?'立即升級銀級':'立即升級金級'), uri: makeUpgradeUri(tier, srcTag) } }
      ]
    }
  };
}

/* ========== 個人測驗（銅級解鎖） ========== */
function makeFlexMenuPersonal(uid, level) {
  const isBronzePlus = (level !== '免費會員');
  const bubbles = [];

  if (!isBronzePlus) {
    bubbles.push(buildUpsellBubble({
      tier: 'bronze',
      title: '銅級暖心解鎖包',
      bullets: ['破冰 / 交心 / 流年 / \n五行 / 情緒 / 20年大運 全解鎖'],
      srcTag: 'upsell_personal'
    }));
  }

  [
    { label: '主性格分析', tag: 'main',   desc: '完整看見你的核心樣貌', paid: false, badge: { text:'免費', color:'#3BA776' } },
    { label: '破冰分析',   tag: 'ice',    desc: '見面互動怎麼更合拍', paid: true  },
    { label: '交心分析',   tag: 'heart',  desc: '更懂彼此在意與距離感', paid: true  },
    { label: '流年分析',   tag: 'flow',   desc: '今年該把力氣放在哪裡', paid: true  },
    { label: '五行分析',   tag: 'element',desc: '你的五行氣質與能力', paid: true },
    { label: '情緒分析',   tag: 'emotion',desc: '情緒反應與安撫方式', paid: true },
    { label: '20年大運',   tag: 'luck20', desc: '三段大運主軸與提醒', paid: true  }
  ].forEach(it => {
    const locked = (it.paid && !isBronzePlus);
    bubbles.push(buildFeatureBubble({
      label: it.label,
      desc: it.desc,
      locked,
      tier: 'bronze',
      actionPostback: `PERSONAL_${it.tag}_${uid}`,
      srcTag: `personal_${it.tag}`,
      isFreeMain: (!it.paid && it.tag === 'main' && !isBronzePlus),
      extraBadge: it.badge || null
    }));
  });

  return { type: 'carousel', contents: bubbles };
}

/* ========== 伴侶配對（銀級解鎖） ========== */
function makeFlexMenuDual(uid, level) {
  // 不再提前讀取/阻擋；menu 先畫，點 postback 時才讀表或快取
  const isSilverPlus = (level !== '免費會員' && level !== '銅級會員');

  const bubbles = [];
  if (!isSilverPlus) {
    bubbles.push(buildUpsellBubble({
      tier: 'silver',
      title: '銀級配對全升級',
      bullets: ['主性格 / 破冰 / 談心 / 五行 / 情緒 配對建議'],
      srcTag: 'upsell_dual'
    }));
  }

  [
    { label: '雙人主性格配對', desc: '雙人主性格分析建議', tag: 'main' },
    { label: '雙人破冰配對',   desc: '雙人破冰分析建議',   tag: 'ice'  },
    { label: '雙人談心配對',   desc: '雙人談心分析建議',   tag: 'heart'},
    { label: '雙人五行配對',   desc: '雙人五行分析建議',   tag: 'wuxing'},
    { label: '雙人情緒配對',   desc: '雙人情緒分析建議',   tag: 'emotion'}
  ].forEach(it => {
    const locked = !isSilverPlus;
    bubbles.push(buildFeatureBubble({
      label: it.label,
      desc: it.desc,
      locked,
      tier: 'silver',
      actionPostback: `DUAL_${it.tag}_${uid}`,
      srcTag: `dual_${it.tag}`
    }));
  });

  return { type: 'carousel', contents: bubbles };
}

/* ========== 親子配對（銀級解鎖） ========== */
function makeFlexMenuParent(uid, level) {
  // 不再提前讀取/阻擋；menu 先畫，點 postback 時才讀表或快取
  const isSilverPlus = (level !== '免費會員' && level !== '銅級會員');

  const bubbles = [];
  if (!isSilverPlus) {
    bubbles.push(buildUpsellBubble({
      tier: 'silver',
      title: '銀級配對全升級',
      bullets: ['孩子主性格 / 破冰 / \n談心 與親子比對'],
      srcTag: 'upsell_parent'
    }));
  }

  [
    { label: '孩子主性格分析', desc: '小孩專屬主性格說明', tag: 'main' },
    { label: '孩子破冰分析',   desc: '小孩專屬破冰說明',   tag: 'ice'  },
    { label: '孩子談心分析',   desc: '小孩專屬談心說明',   tag: 'heart'},
    { label: '親子主性格比對', desc: '親子主性格配對',     tag: 'dual_main' },
    { label: '親子破冰比對',   desc: '親子破冰配對',       tag: 'dual_ice'  },
    { label: '親子談心比對',   desc: '親子談心配對',       tag: 'dual_heart'}
  ].forEach(it => {
    const locked = !isSilverPlus;
    bubbles.push(buildFeatureBubble({
      label: it.label,
      desc: it.desc,
      locked,
      tier: 'silver',
      actionPostback: `PARENT_${it.tag}_${uid}`,
      srcTag: `parent_${it.tag}`
    }));
  });

  return { type: 'carousel', contents: bubbles };
}

/* ========== 成交分析（金級解鎖：商品/服務/金融/保險/不動產） ========== */
function _makeSalesMenu(uid, level, prefix, titleList) {
  const isGoldPlus = (level === '金級會員' || level === '鑽級會員');
  const bubbles = [];

  if (!isGoldPlus) {
    bubbles.push(buildUpsellBubble({
      tier: 'gold',
      title: '金級功能全開通',
      bullets: ['破冰 / 談心 / 收單 / \n其他輔助話術一次解鎖'],
      srcTag: `upsell_${prefix.toLowerCase()}`
    }));
  }

  titleList.forEach(it => {
    const locked = !isGoldPlus;
    bubbles.push(buildFeatureBubble({
      label: it.label,
      desc: it.desc,
      locked,
      tier: 'gold',
      actionPostback: `${prefix}_${it.tag}_${uid}`,
      srcTag: `${prefix.toLowerCase()}_${it.tag}`
    }));
  });

  return { type: 'carousel', contents: bubbles };
}

function makeFlexMenuProduct(uid, level) {
  return _makeSalesMenu(uid, level, 'PRODUCT', [
    { label: '破冰開門話術', tag: 'ice',   desc: '建立信任，打開成交對話序幕' },
    { label: '談心說明話術', tag: 'heart', desc: '深入理解，感受貼心與誠意' },
    { label: '締結收單話術', tag: 'deal',  desc: '帶出成交關鍵，收下同意' },
    { label: '額外說明話術', tag: 'extra', desc: '其他輔助話術，靈活應對' }
  ]);
}
function makeFlexMenuService(uid, level) {
  return _makeSalesMenu(uid, level, 'SERVICE', [
    { label: '破冰開門話術', tag: 'ice',   desc: '建立信任，打開成交對話序幕' },
    { label: '談心說明話術', tag: 'heart', desc: '深入理解，感受貼心與誠意' },
    { label: '締結收單話術', tag: 'deal',  desc: '帶出成交關鍵，收下同意' },
    { label: '額外說明話術', tag: 'extra', desc: '其他輔助話術，靈活應對' }
  ]);
}
function makeFlexMenuFinance(uid, level) {
  return _makeSalesMenu(uid, level, 'FINANCE', [
    { label: '破冰開門話術', tag: 'ice',   desc: '建立信任，打開成交對話序幕' },
    { label: '談心說明話術', tag: 'heart', desc: '深入理解，感受貼心與誠意' },
    { label: '締結收單話術', tag: 'deal',  desc: '帶出成交關鍵，收下同意' },
    { label: '額外說明話術', tag: 'extra', desc: '其他輔助話術，靈活應對' }
  ]);
}
function makeFlexMenuInsure(uid, level) {
  return _makeSalesMenu(uid, level, 'INSURE', [
    { label: '破冰開門話術', tag: 'ice',   desc: '建立信任，打開成交對話序幕' },
    { label: '談心說明話術', tag: 'heart', desc: '深入理解，感受貼心與誠意' },
    { label: '締結收單話術', tag: 'deal',  desc: '帶出成交關鍵，收下同意' },
    { label: '額外說明話術', tag: 'extra', desc: '其他輔助話術，靈活應對' }
  ]);
}
function makeFlexMenuEstate(uid, level) {
  return _makeSalesMenu(uid, level, 'ESTATE', [
    { label: '破冰開門話術', tag: 'ice',   desc: '建立信任，打開成交對話序幕' },
    { label: '談心說明話術', tag: 'heart', desc: '深入理解，感受貼心與誠意' },
    { label: '締結收單話術', tag: 'deal',  desc: '帶出成交關鍵，收下同意' },
    { label: '額外說明話術', tag: 'extra', desc: '其他輔助話術，靈活應對' }
  ]);
}

/* ========== 夥伴能力碼（金級解鎖） ========== */
function makeFlexMenuPartnerFirst(uid, level) {
  const isGoldPlus = (level === '金級會員' || level === '鑽級會員');
  const bubbles = [];

  if (!isGoldPlus) {
    bubbles.push(buildUpsellBubble({
      tier: 'gold',
      title: '夥伴能力碼解鎖',
      bullets: ['前三組能力碼＋\n更多能力碼瀏覽'],
      srcTag: 'upsell_partner'
    }));
  }

  [
    { tag: 'code1', label: '第1組能力碼', desc: PARTNER_CODE_LABELS[0] },
    { tag: 'code2', label: '第2組能力碼', desc: PARTNER_CODE_LABELS[1] },
    { tag: 'code3', label: '第3組能力碼', desc: PARTNER_CODE_LABELS[2] },
    { tag: 'more',  label: '更多組能力碼', desc: '查看更多深層特質' }
  ].forEach(it => {
    const locked = !isGoldPlus;
    bubbles.push(buildFeatureBubble({
      label: it.label,
      desc: it.desc,
      locked,
      tier: 'gold',
      actionPostback: `PARTNER_${it.tag}_${uid}`,
      srcTag: `partner_${it.tag}`
    }));
  });

  return { type: 'carousel', contents: bubbles };
}

function makeFlexMenuPartnerMore(uid, level) {
  const isGoldPlus = (level === '金級會員' || level === '鑽級會員');
  const bubbles = [];

  if (!isGoldPlus) {
    bubbles.push(buildUpsellBubble({
      tier: 'gold',
      title: '金級・更多能力碼',
      bullets: ['第4～12組能力碼一次解鎖'],
      srcTag: 'upsell_partner_more'
    }));
  }

  for (let i = 4; i <= 12; i++) {
    const locked = !isGoldPlus;
    bubbles.push(buildFeatureBubble({
      label: `第${i}組能力碼`,
      desc: PARTNER_CODE_LABELS[i - 1],
      locked,
      tier: 'gold',
      actionPostback: `PARTNER_code${i}_${uid}`,
      srcTag: `partner_code${i}`
    }));
  }

  return { type: 'carousel', contents: bubbles };
}

/** 三階升級（銅/銀/金）合併成一張 carousel Flex */
function buildUpsellAllTiersFlex() {
  return {
    type: 'flex',
    altText: '升級解鎖更多內容',
    contents: {
      type: 'carousel',
      contents: [
        // 銅級：個人向功能
        buildUpsellBubble({
          tier: 'bronze',
          title: '銅級暖心解鎖包',
          bullets: ['整個月無限次測驗', '主性格完整解析', '拆解如何互動與深聊', '流年運勢分析', '五行數據解析', '情緒觸發點與建議', '預知20年大運', '1天不到4塊'],
          srcTag: 'upsell_after_main_bronze'
        }),
        // 銀級：雙人/親子配對
        buildUpsellBubble({
          tier: 'silver',
          title: '銀級配對全升級',
          bullets: ['整個月無限次測驗', '銅級會員所有權限', '感情配對須知與建議', '親子配對須知與建議', '各類型孩子教養方針', '每月運勢提醒', '每月直播通知', '1天約5塊'],
          srcTag: 'upsell_after_main_silver'
        }),
        // 金級：成交分析＋夥伴能力碼
        buildUpsellBubble({
          tier: 'gold',
          title: '金級功能全開通',
          bullets: ['整個月無限次測驗', '銀級會員所有權限', '有形商品客戶分析', '無形服務客戶分析', '金融商品客戶分析', '保險商品客戶分析', '不動產客戶分析', '夥伴能力屬性分析', '1天約1顆茶葉蛋'],
          srcTag: 'upsell_after_main_gold'
        })
      ]
    }
  };
}

/** 覆蓋版：主性格說明（免費會員看完後推銅/銀/金升級 Flex） */
function sendMainNumberDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);

  const calcRow = getCalcRowByUid(uid);
  if (!calcRow) {
    return replyMessage(replyToken, [{ type:'text', text:'查無會員計算紀錄，請重新輸入生日' }]);
  }
  const n7 = calcRow[7]; // H 欄主性格

  const mainMap = TABLES.MAIN_PAID();
  const mainRow = mainMap[String(n7)];
  if (!mainRow) {
    return replyMessage(replyToken, [{ type:'text', text:'查無主性格內容，請聯絡客服' }]);
  }

  // === 免費會員：主性格簡述 + 三階升級 carousel ===
  if (level === '免費會員') {
    const desc = mainRow[1];
    const msg  = `🔍您的主性格為 ${n7} 號：\n\n${desc}`;

    const upsellFlex = buildUpsellAllTiersFlex(); // 按鈕走 makeUpgradeUri()

    return replyMessage(replyToken, [
      { type:'text', text: msg },
      upsellFlex
    ]);
  }

  // === 已付費會員：完整內容（維持不變） ===
  const desc   = mainRow[1];
  const remind = mainRow[2];
  const love   = mainRow[3];
  const work   = mainRow[4];
  const wealth = mainRow[5];
  const fullMsg =
    `🔍您的主性格為 ${n7} 號\n\n` +
    `【主數內容】\n${desc}\n\n` +
    `【溫柔提醒】\n${remind}\n\n` +
    `【戀愛建議】\n${love}\n\n` +
    `【工作建議】\n${work}\n\n` +
    `【財富建議】\n${wealth}`;

  return replyMessage(replyToken, [{ type:'text', text: fullMsg }]);
}

function sendPersonalIceDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員') {
    return replyMessage(replyToken, [{ type:'text', text:'請升級會員以解鎖完整破冰分析！' }]);
  }

  const calcRow = getCalcRowByUid(uid);
  if (!calcRow) return replyMessage(replyToken, [{ type:'text', text:'查無會員計算紀錄，請重新輸入生日' }]);
  const n1 = calcRow[1];

  const map = TABLES.ICE_HEART();
  const row = map[String(n1)];
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無破冰內容，請聯絡客服' }]);

  const desc = row[1];
  const msg = `🌟 你的破冰數字為 ${n1} 號\n\n${desc}`;
  return replyMessage(replyToken, [{ type:'text', text: msg }]);
}

function sendPersonalHeartDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員') {
    return replyMessage(replyToken, [{ type:'text', text:'請升級會員以解鎖完整交心分析！' }]);
  }

  const calcRow = getCalcRowByUid(uid);
  if (!calcRow) return replyMessage(replyToken, [{ type:'text', text:'查無會員計算紀錄，請重新輸入生日' }]);
  const n4 = calcRow[4];

  const map = TABLES.ICE_HEART();
  const row = map[String(n4)];
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無交心內容，請聯絡客服' }]);

  const desc = row[2];
  const msg = `💕 你的交心數字為 ${n4} 號\n\n${desc}`;
  return replyMessage(replyToken, [{ type:'text', text: msg }]);
}

/** ▲ 覆蓋：流年內容（先讀快取，再退回表單 H 欄） */
function sendPersonalFlowDescription(uid, replyToken) {
  const level = getMemberLevel(uid);
  if (level === '免費會員') {
    return replyMessage(replyToken, [{ type: 'text', text: '請升級會員以解鎖完整流年分析！' }]);
  }

  const uc = CacheService.getUserCache();
  let flowNum = uc.get(uid + '_flow');      // ① 最新快取（輸入生日當下即寫入）

  if (!flowNum) {                            // ② 沒快取 → 回退表單 H 欄
    const pack = getMemberRowByUidFast(uid);
    if (!pack) return replyMessage(replyToken, [{ type:'text', text:'查無會員資料，請重新輸入生日' }]);
    flowNum = pack.row[7];
    if (flowNum != null && flowNum !== '') {
      uc.put(uid + '_flow', String(flowNum), UCACHE_TTL_SHORT);
    }
  }

  const row = TABLES.FLOW()[String(flowNum)];
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無流年內容，請聯絡客服' }]);

  const thisYear = new Date().getFullYear();
  const msg =
    `📅 您的 ${thisYear} 年流年數為 ${flowNum} 號\n\n` +
    `【內容說明】\n${row[1]}\n\n` +
    `【流年建議事項】\n${row[2]}\n\n` +
    `【職場建議】\n${row[3]}\n\n` +
    `【感情建議】\n${row[4]}\n\n` +
    `【財富建議】\n${row[5]}\n\n` +
    `【流年總覽】\n${row[6]}`;
  return replyMessage(replyToken, [{ type:'text', text: msg }]);
}

function sendPersonalElementDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員') {
    return replyMessage(replyToken, [{ type:'text', text:'請升級會員以解鎖完整五行分析！' }]);
  }

  const calcRow = getCalcRowByUid(uid);
  if (!calcRow) return replyMessage(replyToken, [{ type:'text', text:'查無會員計算紀錄，請重新輸入生日' }]);
  const n7 = calcRow[7];

  const map = TABLES.WUXING();
  const row = map[String(n7)];
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無五行內容，請聯絡客服' }]);

  const wuXing = row[1], desc=row[2], work=row[3], remind=row[4];
  const msg =
    `🔮 你的主性格對應五行為：${wuXing}\n\n` +
    `【五行內容】\n${desc}\n\n` +
    `【工作建議】\n${work}\n\n` +
    `【溫柔提醒】\n${remind}`;
  return replyMessage(replyToken, [{ type:'text', text: msg }]);
}

function sendPersonalEmotionDescription(uid, replyToken) {
  const level = getMemberLevel(uid);
  if (level === '免費會員') {
    return replyMessage(replyToken, [{ type:'text', text:'請升級會員以解鎖完整情緒分析！' }]);
  }
  const calcRow = getCalcRowByUid(uid);
  if (!calcRow) return replyMessage(replyToken, [{ type:'text', text:'查無會員計算紀錄，請重新輸入生日' }]);

  const n7  = String(calcRow[7]).trim();
  const row = TABLES.EMOTION()[n7];
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無情緒分析內容，請聯絡客服' }]);

  const msg =
    `🌀 你的主性格對應情緒數字為：${n7}\n\n` +
    `【情緒觸發點】\n${row[1]}\n\n` +
    `【情緒彰顯】\n${row[2]}\n\n` +
    `【典型場景表現】\n${row[3]}\n\n` +
    `【溫柔提醒】\n${row[4]}`;
  return replyMessage(replyToken, [{ type:'text', text: msg }]);
}

function sendPersonalLuck20Description(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員') {
    return replyMessage(replyToken, [{ type:'text', text:'請升級會員以解鎖完整 20 年大運分析！' }]);
  }

  const unionRow = getUnionRowByUid(uid);
  if (!unionRow) return replyMessage(replyToken, [{ type:'text', text:'查無聯合碼紀錄，請重新輸入生日' }]);

  const code6  = unionRow[6];
  const code9  = unionRow[9];
  const code12 = unionRow[12];

  const luckMap = TABLES.LUCK20();
  const row6  = luckMap[String(code6)];
  const row9  = luckMap[String(code9)];
  const row12 = luckMap[String(code12)];
  if (!row6 || !row9 || !row12) {
    return replyMessage(replyToken, [{ type:'text', text:'查無 20 年大運內容，請聯絡客服' }]);
  }

  const msg =
    `🏃【20～40歲運勢】\n\n♠️運勢內容\n${row6[1]}\n\n✔️運勢建議\n${row6[2]}\n\n` +
    `🧧【40～60歲運勢】\n\n♠️運勢內容\n${row9[3]}\n\n✔️運勢建議\n${row9[4]}\n\n` +
    `🗽【60歲以後運勢】\n\n♠️運勢內容\n${row12[5]}\n\n✔️運勢建議\n${row12[6]}`;
  return replyMessage(replyToken, [{ type:'text', text: msg }]);
}

// ===== helper：矩陣快取存取 =====
function getMatrixByNameCached(sheetName) {
  return getMatrixCached(sheetName, SCACHE_TTL_LONG); // 已內建鎖與快取
}

/** 雙人：主性格配對（快取版） */
function sendDualMainDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type:'text', text:'此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }

  const row = getPairRowByUid(uid);
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無配對資料，請重新操作。' }]);

  const n7_A = parseInt(row[6], 10);
  const n7_B = parseInt(row[11], 10);

  const { data } = getMatrixByNameCached('戀愛主性格表單');
  const content = data?.[n7_A]?.[n7_B];
  if (!content) {
    return replyMessage(replyToken, [{ type:'text', text:'查無主性格配對內容，請聯絡客服。' }]);
  }

  const msg = `👩‍❤️‍👨【雙人主性格配對】\n\n生日1主性格：${n7_A} 號\n生日2主性格：${n7_B} 號\n\n${content}`;
  replyMessage(replyToken, [{ type:'text', text: msg }]);
}

/** 雙人：破冰配對（快取版） */
function sendDualIceDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type:'text', text:'此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }

  const row = getPairRowByUid(uid);
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無配對資料，請重新操作。' }]);

  const n1_A = parseInt(row[4], 10);
  const n1_B = parseInt(row[9],  10);

  const { data } = getMatrixByNameCached('戀愛破冰表單');
  const content = data?.[n1_A]?.[n1_B];
  if (!content) {
    return replyMessage(replyToken, [{ type:'text', text:'查無破冰配對內容，請聯絡客服。' }]);
  }

  const msg = `🧊【雙人破冰配對】\n\n生日1破冰數字：${n1_A} 號\n生日2破冰數字：${n1_B} 號\n\n${content}`;
  replyMessage(replyToken, [{ type:'text', text: msg }]);
}

/** 雙人：談心配對（快取版） */
function sendDualHeartDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type:'text', text:'此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }

  const row = getPairRowByUid(uid);
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無配對資料，請重新操作。' }]);

  const n4_A = parseInt(row[5],  10);
  const n4_B = parseInt(row[10], 10);

  const { data } = getMatrixByNameCached('戀愛交心表單');
  const content = data?.[n4_A]?.[n4_B];
  if (!content) {
    return replyMessage(replyToken, [{ type:'text', text:'查無談心配對內容，請聯絡客服。' }]);
  }

  const msg =
    `💬【雙人談心配對】\n\n` +
    `生日1交心數字：${n4_A} 號\n生日2交心數字：${n4_B} 號\n\n` +
    `${content}`;
  replyMessage(replyToken, [{ type:'text', text: msg }]);
}

function sendDualWuXingDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type:'text', text:'此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }

  const row = getPairRowByUid(uid);
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無配對資料，請重新操作。' }]);

  const wuxing_A = String(row[7]).trim();
  const wuxing_B = String(row[12]).trim();

  const { data, header } = getWuxingMatrixCached();
  const rowIndex = data.findIndex((r, i) => i>0 && String(r[0]).trim() === wuxing_A);
  const colIndex = header.findIndex(h => String(h).trim() === wuxing_B);
  if (rowIndex === -1 || colIndex === -1 || !data[rowIndex][colIndex]) {
    return replyMessage(replyToken, [{ type:'text', text:'查無五行配對內容，請聯絡客服。' }]);
  }

  const content = data[rowIndex][colIndex];
  const msg = `🌟【雙人五行配對】\n\n生日1五行：${wuxing_A}\n生日2五行：${wuxing_B}\n\n${content}`;
  replyMessage(replyToken, [{ type:'text', text: msg }]);
}

/** 雙人：情緒配對（快取版） */
function sendDualEmotionDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type:'text', text:'此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }

  const row = getPairRowByUid(uid);
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無配對資料，請重新操作。' }]);

  const eA = parseInt(row[8],  10); // 情緒A（I欄）
  const eB = parseInt(row[13], 10); // 情緒B（N欄）

  const { data } = getMatrixByNameCached('戀愛情緒表單');
  const content = data?.[eA]?.[eB];
  if (!content) {
    return replyMessage(replyToken, [{ type:'text', text:'查無情緒配對內容，請聯絡客服。' }]);
  }

  const msg = `🌀【雙人情緒配對】\n\n對象1情緒數字：${eA} 號\n對象2情緒數字：${eB} 號\n\n${content}`;
  replyMessage(replyToken, [{ type:'text', text: msg }]);
}

function sendParentMainDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type: 'text', text: '此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }

  const pairRow = getPairRowByUid(uid);
  if (!pairRow) return replyMessage(replyToken, [{ type: 'text', text: '查無配對資料，請重新操作。' }]);

  const n7_A = String(pairRow[6]); // 孩子主性格

  const { header, mapByKey } = getTableWithHeader('小孩數據內容', 0);
  const row = mapByKey[n7_A];
  if (!row) return replyMessage(replyToken, [{ type: 'text', text: `查無 ${n7_A} 號孩子主性格說明，請聯絡客服。` }]);

  const colMain = _colIndexByHeader(header, ['主性格','主性格內容','孩子主性格']);
  if (colMain === -1) return replyMessage(replyToken, [{ type:'text', text:'小孩數據內容表缺少「主性格」欄。' }]);

  const mainDesc = row[colMain];
  const msg = `👶【孩子主性格分析】\n\n孩子主性格為：${n7_A} 號\n\n${mainDesc}`;
  return replyMessage(replyToken, [{ type: 'text', text: msg }]);
}

function sendParentIceDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type: 'text', text: '此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }
  const pairRow = getPairRowByUid(uid);
  if (!pairRow) return replyMessage(replyToken, [{ type: 'text', text: '查無配對資料，請重新操作。' }]);

  const n1_A = String(pairRow[4]); // 孩子 n1
  const { header, mapByKey } = getTableWithHeader('小孩數據內容', 0);
  const row = mapByKey[n1_A];
  if (!row) return replyMessage(replyToken, [{ type: 'text', text: `查無 ${n1_A} 號孩子破冰內容，請聯絡客服。` }]);

  const colIce = _colIndexByHeader(header, ['破冰','破冰內容','孩子破冰']);
  if (colIce === -1) return replyMessage(replyToken, [{ type:'text', text:'小孩數據內容表缺少「破冰」欄。' }]);

  const iceDesc = row[colIce];
  const msg = `❄️【孩子破冰分析】\n\n孩子破冰數字：${n1_A} 號\n\n${iceDesc}`;
  return replyMessage(replyToken, [{ type: 'text', text: msg }]);
}

function sendParentHeartDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type: 'text', text: '此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }
  const pairRow = getPairRowByUid(uid);
  if (!pairRow) return replyMessage(replyToken, [{ type: 'text', text: '查無配對資料，請重新操作。' }]);

  const n4_A = String(pairRow[5]); // 孩子 n4
  const { header, mapByKey } = getTableWithHeader('小孩數據內容', 0);
  const row = mapByKey[n4_A];
  if (!row) return replyMessage(replyToken, [{ type: 'text', text: `查無 ${n4_A} 號孩子談心內容，請聯絡客服。` }]);

  const colHeart = _colIndexByHeader(header, ['談心','談心內容','孩子談心']);
  if (colHeart === -1) return replyMessage(replyToken, [{ type:'text', text:'小孩數據內容表缺少「談心」欄。' }]);

  const heartDesc = row[colHeart];
  const msg = `💬【孩子談心分析】\n\n孩子談心數字：${n4_A} 號\n\n${heartDesc}`;
  return replyMessage(replyToken, [{ type: 'text', text: msg }]);
}

/** 親子：主性格比對（快取版） */
function sendParentDualMainDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type:'text', text:'此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }

  const row = getPairRowByUid(uid);
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無配對資料，請重新操作。' }]);

  const n7Child  = String(row[6]).trim();  // 孩子主性格
  const n7Parent = String(row[11]).trim(); // 父母主性格

  const { data, header } = getMatrixByNameCached('親子主性格分析');
  const rowIndex = data.findIndex((r, i) => i > 0 && String(r[0]).trim() === n7Parent); // A欄：父母
  const colIndex = header.findIndex(h => String(h).trim() === n7Child);                  // 表頭：孩子
  if (rowIndex === -1 || colIndex === -1) {
    return replyMessage(replyToken, [{ type:'text', text:'查無主性格比對內容，請聯絡客服。' }]);
  }

  const content = data[rowIndex][colIndex];
  if (!content) return replyMessage(replyToken, [{ type:'text', text:'主性格配對內容為空，請聯絡客服。' }]);

  const msg =
    `👨‍👩‍👧‍👦【親子主性格比對】\n\n` +
    `父母主性格：${n7Parent} 號\n孩子主性格：${n7Child} 號\n\n` +
    `${content}`;
  replyMessage(replyToken, [{ type:'text', text: msg }]);
}

/** 親子：破冰比對（快取版） */
function sendParentDualIceDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type:'text', text:'此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }

  const row = getPairRowByUid(uid);
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無配對資料，請重新操作。' }]);

  const n1Child  = String(row[4]).trim();  // 孩子 n1
  const n1Parent = String(row[9]).trim();  // 父母 n1

  const { data, header } = getMatrixByNameCached('親子破冰分析');
  const rowIndex = data.findIndex((r, i) => i > 0 && String(r[0]).trim() === n1Parent); // A欄：父母
  const colIndex = header.findIndex(h => String(h).trim() === n1Child);                  // 表頭：孩子
  if (rowIndex === -1 || colIndex === -1) {
    return replyMessage(replyToken, [{ type:'text', text:'查無破冰比對內容，請聯絡客服。' }]);
  }

  const content = data[rowIndex][colIndex];
  if (!content) return replyMessage(replyToken, [{ type:'text', text:'親子破冰配對內容為空，請聯絡客服。' }]);

  const msg =
    `🧊【親子破冰比對】\n\n` +
    `父母破冰數字：${n1Parent} 號\n孩子破冰數字：${n1Child} 號\n\n` +
    `${content}`;
  replyMessage(replyToken, [{ type:'text', text: msg }]);
}

/** 親子：談心比對（快取版） */
function sendParentDualHeartDescription(uid, replyToken) {
  const level = getMemberLevelFast(uid);
  if (level === '免費會員' || level === '銅級會員') {
    return replyMessage(replyToken, [{ type:'text', text:'此功能僅限銀級會員以上解鎖，請升級會員！' }]);
  }

  const row = getPairRowByUid(uid);
  if (!row) return replyMessage(replyToken, [{ type:'text', text:'查無配對資料，請重新操作。' }]);

  const n4Child  = String(row[5]).trim();   // 孩子 n4
  const n4Parent = String(row[10]).trim();  // 父母 n4

  const { data, header } = getMatrixByNameCached('親子交心分析');
  const rowIndex = data.findIndex((r, i) => i > 0 && String(r[0]).trim() === n4Parent); // A欄：父母
  const colIndex = header.findIndex(h => String(h).trim() === n4Child);                  // 表頭：孩子
  if (rowIndex === -1 || colIndex === -1) {
    return replyMessage(replyToken, [{ type:'text', text:'查無談心比對內容，請聯絡客服。' }]);
  }

  const content = data[rowIndex][colIndex];
  if (!content) return replyMessage(replyToken, [{ type:'text', text:'親子交心配對內容為空，請聯絡客服。' }]);

  const msg =
    `💬【親子談心比對】\n\n` +
    `父母談心數字：${n4Parent} 號\n孩子談心數字：${n4Child} 號\n\n` +
    `${content}`;
  replyMessage(replyToken, [{ type:'text', text: msg }]);
}

/** 通用話術推播（PROD/SERV/FIN/INS）：單欄版「額外說明」 */
function sendDealSpeech(uid, replyToken, type, metric) {
  const level = getMemberLevelFast(uid);
  if (level !== '金級會員' && level !== '鑽級會員') {
    return replyMessage(replyToken, [{ type:'text', text:'此話術僅限金級會員以上解鎖，請升級會員！' }]);
  }

  const calc = getCalcRowByUid(uid);
  if (!calc) return replyMessage(replyToken, [{ type:'text', text:'查無會員運算資料，請重新測驗。' }]);

  const sheetName =
    type === 'PROD' ? '有形商品成交分析' :
    type === 'SERV' ? '無形服務成交分析' :
    type === 'FIN'  ? '金融商品成交分析' :
                      '保險商品成交分析';

  const { header, mapByKey } = getTableWithHeader(sheetName, 0); // A欄是數字鍵

  // 欄位表頭候選（為了相容舊表名，保留幾個同義詞）
  const COLS = {
    n1: { title: ['破冰標題','破冰開門話術','破冰(標題)','破冰-標題'],
          body:  ['破冰內容','破冰開門話術內容','破冰(內容)','破冰-內容'] },
    n4: { title: ['談心標題','談心說明話術','談心(標題)','談心-標題'],
          body:  ['談心內容','談心說明話術內容','談心(內容)','談心-內容'] },
    n7: { title: ['收單標題','締結收單話術','收單(標題)','收單-標題','締結標題'],
          body:  ['收單內容','締結收單話術內容','收單(內容)','收單-內容','締結內容'] },
    // ★ 單一欄位版本
    extraSingle: ['額外說明','額外說明(或標題/內容)','額外說明(合併)','額外說明(標題/內容)']
  };

  // 額外說明：單欄「額外說明」
  if (metric === 'extra') {
    // 選號邏輯：有重複就推重複號；否則用 n4
    const numCount = {};
    calc.slice(1, 8).forEach(n => numCount[n] = (numCount[n] || 0) + 1);
    const duplicated = Object.keys(numCount).filter(k => numCount[k] >= 2);
    const numbersToUse = duplicated.length ? duplicated : [String(calc[4])];

    const xIdx = _colIndexByHeader(header, COLS.extraSingle);
    if (xIdx === -1) {
      return replyMessage(replyToken, [{ type:'text', text:`表單「${sheetName}」缺少「額外說明」欄，請檢查表頭。` }]);
    }

    const msgs = [];
    numbersToUse.forEach(numStr => {
      const r = mapByKey[String(numStr)];
      if (!r) return;
      const extra = r[xIdx] || '';
      if (String(extra).trim()) {
        msgs.push({ type:'text', text:`【額外說明】（數字：${numStr}）\n${extra}` });
      }
    });

    if (!msgs.length) msgs.push({ type:'text', text:'查無對應額外說明資料。' });
    return replyMessage(replyToken, msgs);
  }

  // n1 / n4 / n7：沿用原雙欄（標題＋內容）邏輯
  const pickIndex = (metric === 'n1') ? 1 : (metric === 'n4') ? 4 : 7;
  const N = String(calc[pickIndex]);
  const row = mapByKey[N];
  if (!row) {
    return replyMessage(replyToken, [{ type:'text', text:`查無對應話術資料（${metric}=${N}）。` }]);
  }

  const conf =
    metric === 'n1' ? { label: '破冰開門話術', cols: COLS.n1 } :
    metric === 'n4' ? { label: '談心說明話術', cols: COLS.n4 } :
                      { label: '締結收單話術', cols: COLS.n7 };

  const tIdx = _colIndexByHeader(header, conf.cols.title);
  const cIdx = _colIndexByHeader(header, conf.cols.body);
  if (tIdx === -1 || cIdx === -1) {
    return replyMessage(replyToken, [{ type:'text', text:`表單「${sheetName}」缺少必要欄位（${metric}）。請檢查表頭。` }]);
  }

  const title = row[tIdx] || '';
  const body  = row[cIdx] || '';
  const msgs = [
    { type:'text', text:`你現在的${conf.label}是「${N}號」` },
    { type:'text', text:`【${conf.label}】\n${title}\n\n${body}` }
  ];
  return replyMessage(replyToken, msgs);
}

// 商品
function sendProductIceDescription(uid, replyToken)  { return sendDealSpeech(uid, replyToken, 'PROD', 'n1'); }
function sendProductHeartDescription(uid, replyToken) { return sendDealSpeech(uid, replyToken, 'PROD', 'n4'); }
function sendProductDealDescription(uid, replyToken)  { return sendDealSpeech(uid, replyToken, 'PROD', 'n7'); }
function sendProductExtraDescription(uid, replyToken) { return sendDealSpeech(uid, replyToken, 'PROD', 'extra'); }

// 服務
function sendServiceIceDescription(uid, replyToken)   { return sendDealSpeech(uid, replyToken, 'SERV', 'n1'); }
function sendServiceHeartDescription(uid, replyToken) { return sendDealSpeech(uid, replyToken, 'SERV', 'n4'); }
function sendServiceDealDescription(uid, replyToken)  { return sendDealSpeech(uid, replyToken, 'SERV', 'n7'); }
function sendServiceExtraDescription(uid, replyToken) { return sendDealSpeech(uid, replyToken, 'SERV', 'extra'); }

// 金融
function sendFinanceIceDescription(uid, replyToken)   { return sendDealSpeech(uid, replyToken, 'FIN',  'n1'); }
function sendFinanceHeartDescription(uid, replyToken) { return sendDealSpeech(uid, replyToken, 'FIN',  'n4'); }
function sendFinanceDealDescription(uid, replyToken)  { return sendDealSpeech(uid, replyToken, 'FIN',  'n7'); }
function sendFinanceExtraDescription(uid, replyToken) { return sendDealSpeech(uid, replyToken, 'FIN',  'extra'); }

// 保險
function sendInsureIceDescription(uid, replyToken)    { return sendDealSpeech(uid, replyToken, 'INS',  'n1'); }
function sendInsureHeartDescription(uid, replyToken)  { return sendDealSpeech(uid, replyToken, 'INS',  'n4'); }
function sendInsureDealDescription(uid, replyToken)   { return sendDealSpeech(uid, replyToken, 'INS',  'n7'); }
function sendInsureExtraDescription(uid, replyToken)  { return sendDealSpeech(uid, replyToken, 'INS',  'extra'); }

/** 讀「不動產商品成交分析」欄位位置（用表頭名稱找，較不易壞） */
function _getEstatePackAndCols() {
  const pack = getTableWithHeader('不動產商品成交分析', 0); // A欄當鍵
  const { header } = pack;

  const iTitle = _colIndexByHeader(header, ['不動產商品結合號碼邏輯']);                 // B
  const iIce   = _colIndexByHeader(header, ['不動產商品引起興趣的破冰話術']);           // C
  const iHeart = _colIndexByHeader(header, ['不動產商品產品須知說明 + 解說話術']);       // D
  const iDeal  = _colIndexByHeader(header, ['不動產商品成交關鍵話術']);                 // E
  const iExtra = _colIndexByHeader(header, ['額外補充話術']);                           // F

  // 若找不到（-1），退回固定索引避免整體壞掉（B..F → 1..5）
  return {
    pack,
    iTitle: iTitle !== -1 ? iTitle : 1,
    iIce:   iIce   !== -1 ? iIce   : 2,
    iHeart: iHeart !== -1 ? iHeart : 3,
    iDeal:  iDeal  !== -1 ? iDeal  : 4,
    iExtra: iExtra !== -1 ? iExtra : 5,
  };
}

/** 核心：依項目輸出不動產話術 */
function _sendEstate(uid, replyToken, metric) {
  const level = getMemberLevel(uid);
  if (level !== '金級會員' && level !== '鑽級會員') {
    return replyMessage(replyToken, [{ type:'text', text:'此話術僅限金級會員以上解鎖，請升級會員！' }]);
  }

  const calc = getCalcRowByUid(uid);
  if (!calc) return replyMessage(replyToken, [{ type:'text', text:'查無會員運算資料，請重新測驗。' }]);

  const { pack, iTitle, iIce, iHeart, iDeal, iExtra } = _getEstatePackAndCols();
  const { mapByKey } = pack;

  // 取對應數字
  let nums = [];
  if (metric === 'ice')   nums = [String(calc[1])]; // n1
  if (metric === 'heart') nums = [String(calc[4])]; // n4
  if (metric === 'deal')  nums = [String(calc[7])]; // n7
  if (metric === 'extra') {
    // 有重複就推重複號，否則用 n4
    const cnt = {};
    calc.slice(1, 8).forEach(n => cnt[n] = (cnt[n] || 0) + 1);
    const dup = Object.keys(cnt).filter(k => cnt[k] >= 2);
    nums = dup.length ? dup : [String(calc[4])];
  }

  const msgs = [];
  nums.forEach(n => {
    const row = mapByKey[String(n)];
    if (!row) return;

    if (metric === 'extra') {
      const extra = row[iExtra] || '';
      if (String(extra).trim()) {
        msgs.push({ type:'text', text:`【額外補充話術】（數字：${n}）\n${extra}` });
      }
      return;
    }

    const title = row[iTitle] || '';
    const body  =
      metric === 'ice'   ? (row[iIce]   || '') :
      metric === 'heart' ? (row[iHeart] || '') :
                           (row[iDeal]  || ''); // deal

    const label =
      metric === 'ice'   ? '破冰開門話術' :
      metric === 'heart' ? '產品須知/解說話術' :
                           '成交關鍵話術';

    const hintNum =
      metric === 'ice'   ? calc[1] :
      metric === 'heart' ? calc[4] :
                           calc[7];

    msgs.push({ type:'text', text:`你現在的${label}是「${hintNum}號」` });
    msgs.push({ type:'text', text:`【${label}】\n${title}\n\n${body}` });
  });

  if (!msgs.length) msgs.push({ type:'text', text:'查無對應話術資料。' });
  return replyMessage(replyToken, msgs);
}

/** 對外接口（保留原函式名稱） */
function sendEstateIceDescription(uid, replyToken)   { return _sendEstate(uid, replyToken, 'ice'); }
function sendEstateHeartDescription(uid, replyToken) { return _sendEstate(uid, replyToken, 'heart'); }
function sendEstateDealDescription(uid, replyToken)  { return _sendEstate(uid, replyToken, 'deal'); }
function sendEstateExtraDescription(uid, replyToken) { return _sendEstate(uid, replyToken, 'extra'); }

function sendPartnerCodeDescription(uid, codeIdx, replyToken) {
  const level = getMemberLevel(uid);
  if (level !== '金級會員' && level !== '鑽級會員') {
    return replyMessage(replyToken, [{ type: 'text', text: '此功能僅限金級會員以上解鎖，請升級會員！' }]);
  }

  // A) 讀「聯合碼紀錄表」的使用者列（UserCache 10 分鐘）
  const unionRow = getUnionRowByUid(uid);
  if (!unionRow) {
    return replyMessage(replyToken, [{ type: 'text', text: '找不到資料，請重新操作' }]);
  }
  const codeValue = unionRow[codeIdx];              // 第 N 組能力碼的 3 碼 (e.g. 157/352)
  const title = `第${codeIdx}組能力碼`;
  const subTitle = PARTNER_CODE_LABELS[codeIdx - 1] || '';

  // B) 讀「81組聯合碼內容表單」快取（ScriptCache 24h）
  const info = getUnion81Content(codeValue);
  if (!info) {
    return replyMessage(replyToken, [{ type: 'text', text: `（找不到「${codeValue}」對應內容）` }]);
  }

  const detail =
    `【聯合碼】${info.code}` +
    (info.core   ? `\n\n【能力核心】${info.core}`     : '') +
    (info.warm   ? `\n\n【溫馨提醒】${info.warm}`     : '') +
    (info.work   ? `\n\n【工作建議】\n${info.work}`    : '') +
    (info.love   ? `\n\n【愛情建議】\n${info.love}`    : '') +
    (info.wealth ? `\n\n【財富建議】\n${info.wealth}`  : '');

  return replyMessage(replyToken, [
    { type: 'text', text: `【${title}】\n${subTitle}\n\n${detail}` }
  ]);
}

const T21_UCACHE_TTL = 600;     // LINE profile → UserCache 10 分鐘
const T21_SCACHE_TTL = 21600;   // 內容/索引/表頭 → ScriptCache 6 小時
const T21_CONTENT_SHEET  = '21天內容';   // A=洞察、B=甦醒、C=操練
const T21_PROGRESS_SHEET = '會員清單';   // 進度寫在這張
const T21_MODULES = {
  insight:  { col: 0, title: '21天洞察',  days: 21 },
  awaken:   { col: 1, title: '21天甦醒',  days: 21 },
  practice: { col: 2, title: '21天操練',  days: 21 },
};
const T21_BRAND = { navy:'#0E3A65', body:'#41566B', hint:'#6B7C93', badge:'#0E63B7' };
const T21_LOCK_MSG = '🔥 只差一步：請來上課解鎖「21天養成計畫」。完成課堂後立即開啟，從今天開始養成新習慣 🌱';

/* ========== 欄位別名（會員清單） ========== */
function t21_aliases_(logical){
  const map = {
    uid: ['UID','uid','Uid'],
    display_name: ['LINE名稱'],
    created_at: ['created_at (ISO)'],
    updated_at: ['updated_at (ISO)']
  };
  return map[logical] || [];
}
function t21_getFieldAliased_(obj, logical){
  const keys = [logical].concat(t21_aliases_(logical));
  for (let i=0;i<keys.length;i++){
    const k = keys[i];
    if (obj && obj[k] != null && String(obj[k]).trim()!=='') return obj[k];
  }
  return '';
}
function t21_setField_(obj, logical, value){
  obj[logical] = value;
  t21_aliases_(logical).forEach(k => obj[k] = value);
}
function t21_findHeaderIndex_(headers, cand){
  const cands = Array.isArray(cand) ? cand : [cand];
  for (let i=0;i<cands.length;i++){
    const idx = headers.indexOf(cands[i]);
    if (idx !== -1) return idx + 1;
  }
  const lower = headers.map(h => String(h).toLowerCase());
  for (let i=0;i<cands.length;i++){
    const idx = lower.indexOf(String(cands[i]).toLowerCase());
    if (idx !== -1) return idx + 1;
  }
  return 0;
}

/* ========== webhook 入口（保持相容） ========== */
function t21_handleEvent_(event) {
  if (!event || event.type!=='message' || !event.message || event.message.type!=='text') return;
  const replyToken = event.replyToken;
  const uid  = (event.source && event.source.userId) ? event.source.userId : '';
  if (!replyToken || !uid) return;

  const txt = String(event.message.text||'').trim();
  if (txt === '21天洞察')  return T21_CMD_setModule_(replyToken, uid, 'insight');
  if (txt === '21天甦醒')  return T21_CMD_setModule_(replyToken, uid, 'awaken');
  if (txt === '21天操練')  return T21_CMD_setModule_(replyToken, uid, 'practice');
  if (txt === '每日任務')   return T21_CMD_dailyTask_(replyToken, uid);
  if (txt === 'PING')       return t21_replyText_(replyToken, 'PONG');
}

/* ========== 讀/寫：active_module 與時間戳 ========== */
function _t21_setActiveModuleAndTouch_(uid, modKey) {
  const sh = t21_ensureProgressSheet_();
  const headers = t21_getProgressHeadersCached_().headers;
  const idxMap = t21_idxMap_();
  const rowNum = idxMap[uid];
  if (!rowNum) return;

  const colActive = t21_findHeaderIndex_(headers, 'active_module');
  const colUpdated = t21_findHeaderIndex_(headers, ['updated_at (ISO)','updated_at']);
  if (colActive) sh.getRange(rowNum, colActive).setValue(modKey || '');
  if (colUpdated) sh.getRange(rowNum, colUpdated).setValue(t21_nowISO_());
}

/* ========== 等級正規化與門檻檢查 ========== */
function t21_normalizeLevel_(s){
  const v = String(s||'').trim();
  if (!v) return '';
  if (/高/.test(v)) return '高階';
  if (/進|中/.test(v)) return '進階';
  if (/初/.test(v)) return '初階';
  return '';
}
function _t21_meetLevelForModule_(courseLevel, mod){
  const lv = t21_normalizeLevel_(courseLevel);
  if (!lv) return false;                         // 未填 → 不給
  if (mod === 'insight')  return /初階|進階|高階/.test(lv);
  if (mod === 'awaken')   return /進階|高階/.test(lv); // 進階以上
  if (mod === 'practice') return /高階/.test(lv);      // 高階
  return false;
}

/* ========== 切換模組（含門檻） ========== */
function T21_CMD_setModule_(replyToken, uid, mod /* 'insight'|'awaken'|'practice' */) {
  const courseLevel = _t21_getCourseLevel_(uid);
  if (!_t21_meetLevelForModule_(courseLevel, mod)) {
    replyMessage(replyToken, [{ type:'text', text: T21_LOCK_MSG }]);
    return;
  }

  _t21_setCurrentModule_(uid, mod);            // 快取目前模組
  _t21_setActiveModuleAndTouch_(uid, mod);     // 寫回 active_module

  let progress = '';
  try { if (typeof t21_getUserProgressText_ === 'function') progress = t21_getUserProgressText_(uid, mod) || ''; } catch(_){}

  const modTitle = (mod==='insight'?'21天洞察':mod==='awaken'?'21天甦醒':'21天操練');
  const text = `✅ 已切換為「${modTitle}」` + (progress ? `目前進度：${progress}。` : '') + `點擊「每日任務」接續今天。`;
  replyMessage(replyToken, [{ type:'text', text }]);
}

function _t21_getCurrentModule_(uid) {
  try {
    const c = CacheService.getUserCache().get(uid + ':t21:module');
    return c || '';
  } catch (_) { return ''; }
}
function _t21_setCurrentModule_(uid, mod) {
  try { CacheService.getUserCache().put(uid + ':t21:module', String(mod || ''), 3600); } catch (_){}
}

/* ========== 讀 course_level（優先用表頭別名） ========== */
function _t21_getCourseLevel_(uid) {
  try {
    const sh = t21_ensureProgressSheet_();
    const headers = t21_getProgressHeadersCached_().headers;
    const lvCol  = t21_findHeaderIndex_(headers, ['course_level','課程等級','課程級別','courseLevel','21天課程等級','21天等級']);
    const rowNum = t21_idxMap_()[uid];
    if (!lvCol || !rowNum) return '';
    return String(sh.getRange(rowNum, lvCol).getValue() || '').trim();
  } catch(_) { return ''; }
}

/* ========== 每日任務入口（含門檻 + 一天一次） ========== */
function T21_CMD_dailyTask_(replyToken, uid) {
  const courseLevel = _t21_getCourseLevel_(uid);
  if (!courseLevel) { replyMessage(replyToken, [{ type:'text', text: T21_LOCK_MSG }]); return; }

  const row = t21_upsertProgressRow_(uid, t21_getLineProfile_(uid).displayName || '');
  const active = String(row['active_module'] || _t21_getCurrentModule_(uid) || '').trim();
  if (!active) { replyMessage(replyToken, [{ type:'text', text: T21_LOCK_MSG }]); return; }

  // 模組門檻：洞察=初階以上；甦醒=進階以上；操練=高階
  if (!_t21_meetLevelForModule_(courseLevel, active)) {
    replyMessage(replyToken, [{ type:'text', text: T21_LOCK_MSG }]);
    return;
  }

  _t21_pushTodayTask_(replyToken, uid, active); // 原子推送＋進位
}

/* ===== 覆蓋：推送今天任務（含 Day21 恭喜＋隔天循環回 Day1） ===== */
function _t21_pushTodayTask_(replyToken, uid, moduleKey) {
  const sh = t21_ensureProgressSheet_();
  const headers = t21_getProgressHeadersCached_().headers;
  const rowNum = t21_idxMap_()[uid];
  if (!rowNum) { t21_replyText_(replyToken, '查無進度紀錄，請稍後重試'); return; }

  const dayCol  = t21_findHeaderIndex_(headers, moduleKey + '_day');
  const lastCol = t21_findHeaderIndex_(headers, moduleKey + '_last');
  const updCol  = t21_findHeaderIndex_(headers, ['updated_at (ISO)','updated_at']);
  if (!dayCol || !lastCol) { t21_replyText_(replyToken, '進度欄位遺失，請聯絡維護'); return; }

  const lock = LockService.getDocumentLock();
  try { lock.waitLock(5000); } catch(_){}

  // === 讀取現況（鎖內） ===
  let curDay = parseInt(String(sh.getRange(rowNum, dayCol).getValue() || '1'), 10);
  if (!curDay || curDay < 1) curDay = 1;

  const rawLast  = sh.getRange(rowNum, lastCol).getValue();
  const lastDate = t21_asYMD_(rawLast);
  const today    = t21_todayYMD_();
  const maxDay   = T21_MODULES[moduleKey].days;

  // === 計算今天要顯示的天數（含隔天回1的循環規則） ===
  let toShowDay = curDay;
  let shouldCongrats = false; // 是否要補發恭喜（只在「第一次到21」當天）

  if (!lastDate || lastDate === today) {
    // 第一次使用 or 今天已做過 → 持續顯示當前天（不進位）
    toShowDay = curDay;
    // 如果今天第一次剛進 21（curDay==21 且 lastDate != today 的情況才會恭喜）
    // 此分支不做恭喜，避免同日重複點重複恭喜
  } else {
    // 已跨日
    if (curDay >= maxDay) {
      // 昨天是 Day21 → 今天回到 Day1 開新一輪
      toShowDay = 1;
    } else {
      // 昨天是 Day1~20 → 進位一天
      toShowDay = curDay + 1;
      if (toShowDay === maxDay) {
        // 這次正好「進到 Day21」：當天送 flex 後＋恭喜一次
        shouldCongrats = true;
      }
    }
  }

  // === 取內容並送出 Flex ===
  const { fixed, dayText } = t21_getModuleTexts_(moduleKey, toShowDay);
  const safeFixed  = (fixed && String(fixed).trim()) ? String(fixed).trim() : null;
  const safeDayTxt = (dayText && String(dayText).trim()) ? String(dayText).trim() : null;

  if (!safeFixed || !safeDayTxt) {
    const fb = [
      `【${T21_MODULES[moduleKey].title}】Day ${toShowDay}`,
      '今日任務內容暫時無法取得，已通知維護。',
      '請稍後再試或明日再點「每日任務」。'
    ].join('\n');
    t21_replyText_(replyToken, fb);
  } else {
    const prof = t21_getLineProfile_(uid);
    const bubble = t21_makeFlexTaskCard_(prof.displayName || '朋友', T21_MODULES[moduleKey].title, toShowDay, safeFixed, safeDayTxt);
    t21_replyFlex_(replyToken, '你的 21 天任務到了', bubble);
  }

  // === 若今天剛「進到 Day21」→ 加送恭喜（同日不重複） ===
  if (shouldCongrats) {
    try {
      const prof = t21_getLineProfile_(uid);
      const text = t21_makeCongratsText_(prof.displayName || '朋友', T21_MODULES[moduleKey].title);
      replyMessage(replyToken, [{ type:'text', text }]);
    } catch(_){}
  }

  // === 寫回進度（今天顯示哪一天，就把 day 設為該值；last 一律寫今天） ===
  sh.getRange(rowNum, dayCol).setValue(String(toShowDay));
  sh.getRange(rowNum, lastCol).setValue(today);
  if (updCol) sh.getRange(rowNum, updCol).setValue(t21_nowISO_());

  try { lock.releaseLock(); } catch(_){}
}

/* ========== 內容存取（A~C 欄一次快取） ========== */
function t21_getModuleTexts_(moduleKey, day) {
  const col = T21_MODULES[moduleKey].col;
  const arr = t21_getContentACCached_();
  const fixed = ((arr[1]     && arr[1][col])     || '').toString().trim(); // 第2列固定文
  const daily = ((arr[day+1] && arr[day+1][col]) || '').toString().trim(); // 第3~23列 Day1~21
  return { fixed, dayText: daily };
}
function t21_getContentACCached_() {
  const sc = CacheService.getScriptCache();
  const ck = 'T21_AC:' + T21_CONTENT_SHEET;
  const hit = sc.get(ck); if (hit) return JSON.parse(hit);
  const sh = SpreadsheetApp.getActive().getSheetByName(T21_CONTENT_SHEET);
  if (!sh) return [];
  const lastRow = sh.getLastRow(); if (lastRow < 2) return [];
  const vals = sh.getRange(1, 1, lastRow, 3).getValues()
                 .map(r => [r[0] || '', r[1] || '', r[2] || '']);
  sc.put(ck, JSON.stringify(vals), T21_SCACHE_TTL);
  return vals;
}

// [覆蓋] t21_ensureProgressSheet_
function t21_ensureProgressSheet_() {
  let sh = SHEET(T21_PROGRESS_SHEET);
  if (!sh) sh = SS().insertSheet(T21_PROGRESS_SHEET);

  const headers = sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  const must = [
    'UID','LINE名稱',
    'active_module',
    'insight_day','insight_last',
    'awaken_day','awaken_last',
    'practice_day','practice_last',
    'course_level',
    'created_at (ISO)','updated_at (ISO)'
  ];
  const toAppend = must.filter(h => headers.indexOf(h) === -1);
  if (toAppend.length){
    sh.getRange(1, headers.length+1, 1, toAppend.length).setValues([toAppend]);
  }

  // *_last 強制文字格式，避免自動轉日期
  try {
    const headsNow = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
    ['insight_last','awaken_last','practice_last'].forEach(h=>{
      const c = t21_findHeaderIndex_(headsNow, h);
      if (c) sh.getRange(1, c, Math.max(2000, sh.getMaxRows()), 1).setNumberFormat('@');
    });
  } catch(e){}
  return sh;
}

// [覆蓋] t21_getProgressHeadersCached_
function t21_getProgressHeadersCached_() {
  const meta = headersCached(T21_PROGRESS_SHEET, T21_SCACHE_TTL);
  return meta && meta.headers ? meta : { headers:[] };
}

function t21_invalidateProgressHeaders_(){ try { CacheService.getScriptCache().remove('T21_HDR:' + T21_PROGRESS_SHEET); } catch(e){} }

function t21_idxMap_() {
  const sc = CacheService.getScriptCache();
  const ck = 'T21_IDX:' + T21_PROGRESS_SHEET;
  const hit = sc.get(ck); if (hit) return JSON.parse(hit);
  const sh = t21_ensureProgressSheet_();
  const headers = t21_getProgressHeadersCached_().headers;
  const uidCol = t21_findHeaderIndex_(headers, t21_aliases_('uid'));
  if (!uidCol) return {};
  const last = sh.getLastRow();
  const map = {};
  if (last >= 2) {
    const uids = sh.getRange(2, uidCol, last-1, 1).getValues();
    for (let i=0;i<uids.length;i++){
      const u = (uids[i][0]||'').toString();
      if (u) map[u] = i+2;
    }
  }
  sc.put(ck, JSON.stringify(map), T21_SCACHE_TTL);
  return map;
}
function t21_invalidateIdx_(){ try{ CacheService.getScriptCache().remove('T21_IDX:' + T21_PROGRESS_SHEET); }catch(e){} }

function t21_upsertProgressRow_(uid, displayNameIfEmpty) {
  const sh = t21_ensureProgressSheet_();
  const headers = t21_getProgressHeadersCached_().headers;
  const idx = t21_idxMap_();
  let rowNum = idx[uid];

  if (rowNum) {
    const arr = sh.getRange(rowNum,1,1,headers.length).getValues()[0];
    const obj = t21_rowToObj_(headers, arr);
    if (displayNameIfEmpty && !t21_getFieldAliased_(obj,'display_name')) {
      t21_setField_(obj, 'display_name', displayNameIfEmpty);
      t21_setField_(obj, 'updated_at', t21_nowISO_());
      t21_saveProgressRow_(obj, rowNum, headers, sh);
    }
    return obj;
  } else {
    const now = t21_nowISO_();
    const obj = t21_newRowFromHeaders_(headers, {
      uid: uid,
      display_name: displayNameIfEmpty || '',
      active_module: '',
      insight_day:'1', insight_last:'', awaken_day:'1',  awaken_last:'',
      practice_day:'1', practice_last:'', course_level:'',
      created_at: now, updated_at: now
    });
    sh.appendRow(t21_objToRow_(headers, obj));
    t21_invalidateIdx_(); t21_invalidateProgressHeaders_();
    return obj;
  }
}
function t21_saveProgressRow_(obj, rowNumOpt, headersOpt, shOpt) {
  const sh = shOpt || t21_ensureProgressSheet_();
  const headers = headersOpt || t21_getProgressHeadersCached_().headers;
  let rowNum = rowNumOpt;
  if (!rowNum) { const idx = t21_idxMap_(); rowNum = idx[obj.uid] || idx[t21_getFieldAliased_(obj,'uid')]; if (!rowNum) return; }
  sh.getRange(rowNum,1,1,headers.length).setValues([t21_objToRow_(headers, obj)]);
}

function t21_newRowFromHeaders_(headers, seed){
  const o = {};
  headers.forEach(h => {
    if (seed.hasOwnProperty(h)) { o[h] = seed[h]; return; }
    if (t21_aliases_('uid').indexOf(h)!==-1)               { o[h] = seed.uid || ''; return; }
    if (t21_aliases_('display_name').indexOf(h)!==-1)      { o[h] = seed.display_name || ''; return; }
    if (t21_aliases_('created_at').indexOf(h)!==-1)        { o[h] = seed.created_at || ''; return; }
    if (t21_aliases_('updated_at').indexOf(h)!==-1)        { o[h] = seed.updated_at || ''; return; }
    o[h] = (seed[h] != null) ? seed[h] : '';
  });
  return o;
}
function t21_rowToObj_(heads, row) { const o={}; heads.forEach((h,i)=>o[h]=row[i]); return o; }
function t21_objToRow_(heads, o){
  return heads.map(h => {
    if (o.hasOwnProperty(h)) return o[h];
    if (t21_aliases_('uid').indexOf(h)!==-1 && o.hasOwnProperty('uid')) return o['uid'];
    if (t21_aliases_('display_name').indexOf(h)!==-1 && o.hasOwnProperty('display_name')) return o['display_name'];
    if (t21_aliases_('created_at').indexOf(h)!==-1 && o.hasOwnProperty('created_at')) return o['created_at'];
    if (t21_aliases_('updated_at').indexOf(h)!==-1 && o.hasOwnProperty('updated_at')) return o['updated_at'];
    return '';
  });
}

/* ========== 日期工具 ========== */
function t21_getDayForModule_(row, moduleKey) {
  const d = Math.max(1, parseInt(row[moduleKey+'_day']||'1',10));
  const raw = row[moduleKey+'_last'] || '';
  const last = t21_asYMD_(raw);
  return { day:d, lastDate:last };
}
// [覆蓋] t21_nowISO_/t21_todayYMD_：委派 Turbo 單例
function t21_nowISO_(){ return nowISO_(); }
function t21_todayYMD_(){ return todayYMD_(); }
function t21_asYMD_(val){
  if (!val) return '';
  if (Object.prototype.toString.call(val) === '[object Date]') {
    const tz = Session.getScriptTimeZone() || 'Asia/Taipei';
    return Utilities.formatDate(val, tz, 'yyyy-MM-dd');
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const y = m[1], mo = ('0'+m[2]).slice(-2), d = ('0'+m[3]).slice(-2);
    return `${y}-${mo}-${d}`;
  }
  return s;
}

/* ========== LINE：reply / profile / Flex ========== */
function t21_replyText_(replyToken, text){ return t21_replyTexts_(replyToken, [text]); }
function t21_replyTexts_(replyToken, texts){
  const token = PropertiesService.getScriptProperties().getProperty('CHANNEL_TOKEN');
  const payload = { replyToken, messages: texts.filter(Boolean).slice(0,5).map(t=>({type:'text', text:String(t)})) };
  return UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method:'post', contentType:'application/json', payload:JSON.stringify(payload),
    headers:{ Authorization:'Bearer '+token }, muteHttpExceptions:true
  }).getResponseCode();
}
function t21_replyFlex_(replyToken, altText, bubble, extrasOpt) {
  const token = PropertiesService.getScriptProperties().getProperty('CHANNEL_TOKEN');
  const messages = [{ type:'flex', altText, contents:bubble }];
  if (Array.isArray(extrasOpt)) {
    extrasOpt.filter(Boolean).forEach(x => {
      if (typeof x === 'string') messages.push({ type:'text', text:String(x) });
      else if (x && typeof x === 'object' && x.type) messages.push(x);
    });
  }
  const payload = { replyToken, messages: messages.slice(0, 5) };
  return UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method:'post', contentType:'application/json',
    payload: JSON.stringify(payload),
    headers:{ Authorization:'Bearer '+token },
    muteHttpExceptions:true
  }).getResponseCode();
}
function t21_makeCongratsText_(name, moduleTitle) {
  return [
    `🎉 恭喜 ${name} 完成「${moduleTitle}」第 21 天！`,
    `你的紀律與行動力很讚 👏`,
    ``,
    `📣 到課堂時請出示此訊息，現場領取：`,
    `• 完成證明（結訓認證）`,
    `• 小小獎勵（限課堂領取）`,
    ``,
    `下一步：把這 21 天養成的節奏，帶到生活與關係中，我們在教室等你！💪`
  ].join('\n');
}
function t21_makeFlexTaskCard_(name, moduleTitle, day, fixed, dayText) {
  return {
    type:"bubble", size:"giga",
    header:{
      type:"box", layout:"vertical", paddingAll:"20px", backgroundColor:"#FFF9F3",
      contents:[
        { type:"box", layout:"baseline", contents:[
          { type:"text", text:moduleTitle, weight:"bold", size:"xxl", color:T21_BRAND.navy },
          { type:"text", text:`Day ${day}`, weight:"bold", size:"xxl", color:T21_BRAND.badge, margin:"12px" }
        ]},
        { type:"text", text:`${name}，你的今日任務到了`, size:"md", color:T21_BRAND.hint, margin:"10px" }
      ]},
    body:{
      type:"box", layout:"vertical", spacing:"16px", paddingAll:"16px",
      contents:[
        { type:"text", text:"✨ 今日提醒", weight:"bold", size:"md", color:T21_BRAND.navy, margin:"4px" },
        { type:"box", layout:"vertical", paddingAll:"12px", backgroundColor:"#FFF3E0", cornerRadius:"12px", contents:[
          { type:"text", text:fixed, wrap:true, size:"md", color:T21_BRAND.body }
        ]},
        { type:"separator", margin:"12px" },
        { type:"text", text:"✅ 今日任務", weight:"bold", size:"md", color:T21_BRAND.navy, margin:"4px" },
        { type:"box", layout:"vertical", paddingAll:"12px", backgroundColor:"#FFFDE7", cornerRadius:"12px", contents:[
          { type:"text", text:dayText, wrap:true, size:"md", color:T21_BRAND.body }
        ]},
        { type:"separator", margin:"16px" },
        { type:"text", text:"完成後，明天 00:00 之後再點擊「每日任務」繼續下一天。", wrap:true, size:"xs", color:T21_BRAND.hint }
      ]}
  };
}
// [覆蓋] t21_getLineProfile_
function t21_getLineProfile_(uid){
  try { return getLineProfileFast(uid); } catch(_){ return { displayName:'' }; }
}

/* ========== 快取清理（維持相容） ========== */
function T21_keepAlive(){ try { PropertiesService.getScriptProperties().getProperty('CHANNEL_TOKEN'); } catch(e) {} }
function T21_warmUp(){ t21_getContentACCached_(); t21_idxMap_(); t21_getProgressHeadersCached_(); }
function T21_forceWarmUp(){ T21_clearCacheForTest(); T21_warmUp(); }
function T21_clearCacheForTest(uidOpt){
  const sc=CacheService.getScriptCache(), uc=CacheService.getUserCache();
  try{ sc.remove('T21_AC:'+T21_CONTENT_SHEET);}catch(e){} try{ sc.remove('T21_IDX:'+T21_PROGRESS_SHEET);}catch(e){}
  try{ sc.remove('T21_HDR:'+T21_PROGRESS_SHEET);}catch(e){} if(uidOpt){ try{ uc.remove('T21_PROF:'+uidOpt);}catch(e){} }
  return 'OK';
}
function T21_clear21Cache(uidOpt) {
  const sc = CacheService.getScriptCache();
  const uc = CacheService.getUserCache();
  ['T21_AC:'+T21_CONTENT_SHEET,'T21_IDX:'+T21_PROGRESS_SHEET,'T21_HDR:'+T21_PROGRESS_SHEET].forEach(k=>{ try{ sc.remove(k);}catch(e){} });
  if (uidOpt) { try{ uc.remove('T21_PROF:'+uidOpt);}catch(e){} }
  try { t21_invalidateIdx_(); } catch(e) {}
  try { t21_invalidateProgressHeaders_(); } catch(e) {}
  return 'OK';
}

