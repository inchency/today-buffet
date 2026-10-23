'use strict';
let currentData = null;
const previewMode = new URLSearchParams(location.search).get('preview') === 'yesterday';
function yesterdayDate() {
  const today = new Date(`${kstDate()}T12:00:00+09:00`);
  today.setUTCDate(today.getUTCDate() - 1);
  return today.toISOString().slice(0, 10);
}
function displayRestaurants() {
  return currentData.restaurants.map(r => {
    const previous = r.previous_menu;
    if (previewMode && !isReady(r) && currentData.date === kstDate() && previous?.menu_date === yesterdayDate())
      return { ...r, ...previous, is_preview: true };
    return r;
  });
}
function hasVisibleMenu(r) { return isReady(r) || (previewMode && r.is_preview === true && r.menu_date === yesterdayDate() && currentData.date === kstDate()); }
function linkNode(text, url) {
  const node = element('a', '', text); node.href = url; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node;
}
const labels = { READY: '당일 메뉴 확인', IMAGE_ONLY: '오늘 메뉴 이미지', UNCONFIGURED: '채널 확인 필요', PENDING: '오늘 공지 대기', UNAVAILABLE: '수집 불가', PARTIAL: '원문 확인 필요' };
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function kstDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}
function isReady(r) { return ['READY', 'IMAGE_ONLY'].includes(r.status) && r.menu_date === kstDate() && currentData.date === kstDate(); }
function renderCards() {
  if (!currentData) return;
  const grid = document.getElementById('menu-grid');
  grid.replaceChildren();
  const query = document.getElementById('search').value.trim().toLocaleLowerCase();
  const region = document.getElementById('region').value;
  const onlyReady = document.getElementById('ready').checked;
  const rows = displayRestaurants().filter(r => (!region || r.region === region) && (!onlyReady || hasVisibleMenu(r)) && [r.name, r.category, r.region_name, ...(r.dishes || [])].join(' ').toLocaleLowerCase().includes(query));
  for (const r of rows) {
    const ready = hasVisibleMenu(r);
    const stale = currentData.date !== kstDate();
    const card = element('article', 'card');
    const heading = element('div', 'card-header');
    const names = element('div');
    names.append(element('p', 'region', `${r.region_name} / ${r.category}${r.registration === "automatic" ? " · 자동 발견" : ""}`), element('h2', '', r.name));
    heading.append(names, element('span', `badge${ready ? ' confirmed' : ''}`, r.is_preview ? `테스트 · ${r.menu_date} 메뉴` : stale ? '지난 수집 기록' : labels[r.status] || '확인 필요'));
    const mapUrl = safeUrl(r.map_url) || `https://map.naver.com/p/search/${encodeURIComponent(r.name + ' ' + (r.location || '강남역'))}`;
    const location = element('p', 'location');
    location.append(element('span', '', r.location || '주소 확인 중'), document.createTextNode(' · '), linkNode('네이버지도 ↗', mapUrl));
    card.append(heading, location);
    const info = element('div', 'restaurant-info');
    if (r.price_text) info.append(element('p', 'price', r.price_text));
    if (r.hours) info.append(element('p', 'hours', r.hours));
    if (Array.isArray(r.usage_notes) && r.usage_notes.length) {
      const details = element('details'); details.append(element('summary', '', '이용 안내'));
      for (const note of r.usage_notes) details.append(element('p', '', note));
      if (r.price_note) details.append(element('p', 'fine-print', r.price_note));
      const infoUrl = safeUrl(r.info_source_url);
      if (infoUrl) details.append(linkNode(`정보 출처${r.info_checked_at ? ' · 조사 ' + r.info_checked_at : ''} ↗`, infoUrl));
      info.append(details);
    }
    card.append(info);
    if (r.source_note) card.append(element('p', 'fine-print', r.source_note));
    if (ready) {
      const dishes = element('div', 'dishes');
      for (const dish of r.dishes || []) dishes.append(element('span', 'dish', dish));
      card.append(dishes);
      if (r.extraction_method === 'gemini_ocr') card.append(element('p', 'fine-print', 'AI가 메뉴판에서 읽은 내용입니다. 원문과 함께 확인하세요.'));
      if (safeUrl(r.image_url)) {
        card.append(element('p', 'message', `${r.is_preview ? '어제' : '오늘'} 메뉴 이미지입니다. 이미지를 눌러 원문을 확인하세요.`));
        const imageUrl = safeUrl(r.image_url);
        const postUrl = safeUrl(r.source_url);
        if (imageUrl && postUrl) {
          const link = element('a'); link.href = postUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
          const img = element('img', 'menu-image'); img.alt = `${r.name} ${r.menu_date} 메뉴 공지`; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = imageUrl;
          img.addEventListener('error', () => { img.hidden = true; link.append(element('span', 'message', '미리보기를 불러오지 못했습니다. 원문 공지를 확인해 주세요.')); });
          link.append(img); card.append(link);
        }
      }
    } else {
      card.append(element('p', 'message', stale ? '오늘 수집 기록이 아직 없습니다. 지난 메뉴를 오늘 메뉴로 표시하지 않습니다.' : r.menu_summary));
    }
    if (!ready && r.channel_audit && typeof r.channel_audit === 'object') {
      card.append(element('p', 'fine-print', `${r.channel_audit.checked_at || ''} 채널 확인: ${r.channel_audit.summary || ''}`));
      const auditUrl = safeUrl(r.channel_audit.url); if (auditUrl) card.append(linkNode('확인한 매장 채널 보기 ↗', auditUrl));
    }
    if (!ready && r.notice_image) {
      const imageUrl = safeUrl(r.notice_image.image_url);
      const noticeUrl = safeUrl(r.notice_image.source_url);
      if (imageUrl && noticeUrl) {
        const details = element('details', 'notice-image');
        details.append(element('summary', '', '날짜 확인 전 원문 이미지 보기'));
        details.append(element('p', 'fine-print', '원문 공지 이미지입니다. 오늘 메뉴로 확정하지 않았으니 이미지의 날짜를 직접 확인하세요.'));
        const link = linkNode('', noticeUrl);
        const img = element('img', 'menu-image'); img.src = imageUrl; img.alt = `${r.name} 날짜 확인 전 원문 공지`; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { img.hidden = true; link.textContent = '원문에서 이미지 확인 ↗'; });
        link.append(img); details.append(link); card.append(details);
      }
    }
    const bottom = element('div', 'card-bottom');
    bottom.append(element('span', '', ready ? `메뉴 ${r.menu_date}${r.cached ? ' · 직전 확인본 유지' : ''}` : '메뉴가 확인되면 이곳에 표시됩니다'));
    const url = safeUrl(r.source_url);
    if (url) {
      const link = element('a', '', `${r.source_label || '원문 공지 보기'} ↗`);
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      bottom.append(link);
    }
    bottom.append(linkNode('지도 보기 ↗', mapUrl));
    const tip = element('a', '', '메뉴 링크 제보'); tip.href = `./community.html?kind=menu&restaurant=${encodeURIComponent(r.name)}`; bottom.append(tip);
    card.append(bottom); grid.append(card);
  }
  if (!rows.length) grid.append(element('p', 'empty', '조건에 맞는 식당이 없습니다. 검색어나 필터를 바꿔 주세요.'));
}
async function loadTodayData() {
  try {
    const response = await fetch('./data/today.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('fetch_failed');
    const data = await response.json();
    if (!Array.isArray(data.restaurants)) throw new Error('invalid_data');
    currentData = data;
    document.getElementById('updated').textContent = `최근 수집 ${data.updated_at_korean}`;
    const confirmed = data.restaurants.filter(isReady).length;
    document.getElementById('summary').textContent = `${data.restaurants.length}개 식당 중 ${confirmed}곳의 오늘 메뉴 확인`;
    const notice = document.getElementById('notice');
    notice.hidden = data.date === kstDate();
    notice.textContent = `현재 기록은 ${data.date} 기준입니다. 오늘 메뉴는 아직 확인되지 않았습니다.`;
    const weather = document.getElementById('weather'); weather.replaceChildren(element('strong', '', '강남역 오늘 날씨'));
    const w = data.weather?.provider === "네이버 날씨" ? data.weather : null;
    if (w && (w.weather_date === kstDate() || w.observed_at?.startsWith(kstDate()))) {
      weather.append(element('p', '', `${w.description} · ${w.temperature}°C / 체감 ${w.apparent_temperature ?? '—'}°C`),
        element('p', 'fine-print', `최저 ${w.low ?? '—'}°C · 최고 ${w.high ?? '—'}°C · 강수확률 ${w.rain_probability ?? '—'}%`),
        linkNode(`${w.provider || '네이버 날씨'} · ${(w.fetched_at || w.observed_at).slice(11,16)} ${w.fetched_at ? '조회' : '관측'}`, safeUrl(w.source_url) || 'https://weather.naver.com/today/09680101?cpName=KMA'));
    } else weather.append(element('p', '', '네이버 날씨 정보를 불러오지 못했습니다. 메뉴는 계속 확인할 수 있어요.'));
    if (!w) weather.append(linkNode('네이버 강남역 날씨 확인 ↗', 'https://weather.naver.com/today/09680101?cpName=KMA'));
    const rec = document.getElementById('recommendation'); rec.replaceChildren();
    const a = data.ai_recommendation;
    rec.hidden = !(a && 'weather_provider' in a && (!a.weather_provider || a.weather_provider === '네이버 날씨') && a.menu_date === kstDate() && !previewMode && isReady(data.restaurants.find(r => r.id === a.restaurant_id) || {}));
    if (!rec.hidden) rec.append(element('strong', '', `오늘의 AI 점심 추천 · ${a.restaurant_name}`),
      element('p', '', (a.dishes || []).join(' · ')), element('p', '', a.reason), element('p', 'fine-print', `확인된 메뉴를 바탕으로 한 AI 추천입니다.${a.weather_observed_at ? ' 날씨 기준 ' + a.weather_observed_at.slice(11,16) + ' KST' : ''}`));
    const previewNotice = document.getElementById('preview-notice'); previewNotice.hidden = !previewMode;
    if (previewMode) {
      previewNotice.textContent = `테스트 미리보기: 오늘 메뉴가 없으면 ${yesterdayDate()} 메뉴를 표시합니다. 어제 메뉴는 오늘 제공 여부를 뜻하지 않습니다.`;
      document.getElementById('summary').textContent = '테스트 미리보기 · 오늘 / 어제 메뉴';
      document.getElementById('preview-link').textContent = '오늘 메뉴 화면으로 돌아가기';
      document.getElementById('preview-link').href = './';
      document.querySelector('.ready-filter').lastChild.textContent = ' 확인된 메뉴만';
    }
    const select = document.getElementById('region');
    const chosen = select.value;
    select.replaceChildren(element('option', '', '전체 지역')); select.firstChild.value = '';
    for (const [id, name] of new Map(data.restaurants.map(r => [r.region, r.region_name]))) {
      const option = element('option', '', name); option.value = id; select.append(option);
    }
    select.value = chosen;
    renderCards();
  } catch {
    document.getElementById('summary').textContent = '메뉴를 불러오지 못했습니다';
    const notice = document.getElementById('notice'); notice.hidden = false;
    notice.textContent = '갱신 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';
    // Existing data becomes stale at KST midnight even during network failure.
    renderCards();
  }
}
for (const id of ['search', 'region', 'ready']) document.getElementById(id).addEventListener('input', renderCards);
loadTodayData();
setInterval(loadTodayData, 5 * 60 * 1000);
