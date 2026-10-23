/* Public UI has no API credentials. GitHub login happens on github.com. */
'use strict';
const ISSUE_ROOT = 'https://github.com/inchency/today-buffet/issues';
const ISSUE_API = 'https://api.github.com/repos/inchency/today-buffet/issues?labels=community-submission&state=all&per_page=20&sort=created&direction=desc';
let communityConfig = {anonymous_endpoint: '', turnstile_site_key: ''};
let widgetId;
const byId = id => document.getElementById(id);
function publicMenuUrl(value) {
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname) || u.hostname.includes(':') || u.hostname.endsWith('.local') || /[\r\n]/.test(value)) return null;
    return u.href;
  } catch { return null; }
}
function mode() { return document.querySelector('input[name="mode"]:checked').value; }
function anonymousReady() { return Boolean(publicMenuUrl(communityConfig.anonymous_endpoint) && communityConfig.turnstile_site_key); }
function status(text) { byId('submission-status').textContent = text; }
function resetWidget() { if (widgetId !== undefined && window.turnstile) window.turnstile.reset(widgetId); }
function mountTurnstile() {
  if (!anonymousReady() || mode() !== 'anonymous') return;
  byId('turnstile-box').hidden = false;
  if (widgetId !== undefined) return;
  if (window.turnstile) {
    widgetId = window.turnstile.render('#turnstile-box', {sitekey: communityConfig.turnstile_site_key, action: 'menu-submission', theme: 'light'});
  } else if (!document.getElementById('turnstile-script')) {
    window.onCommunityTurnstileLoad = mountTurnstile;
    const script = document.createElement('script'); script.id = 'turnstile-script'; script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onCommunityTurnstileLoad&render=explicit'; script.async = true; script.defer = true;
    script.onerror = () => status('보안 확인을 불러오지 못했습니다.' + ' 잠시 후 다시 시도하거나 GitHub 계정으로 제보해 주세요.');
    document.head.append(script);
  }
}
function updateMode() {
  const anon = mode() === 'anonymous';
  byId('mode-help').textContent = anon ? anonymousReady() ? '로그인 없이 제보합니다. 공개 정보만 입력해 주세요.' : '비회원 제보는 준비 중입니다. 지금은 GitHub 계정으로 제보할 수 있습니다.' : '입력한 내용을 GitHub 제보 양식으로 옮깁니다. 로그인 후 최종 등록해 주세요.';
  byId('submit-button').textContent = anon ? '비회원으로 제보하기' : 'GitHub에서 등록하기 ↗';
  byId('submit-button').disabled = anon && !anonymousReady();
  byId('turnstile-box').hidden = !anon || !anonymousReady();
  status(''); mountTurnstile();
}
function issueFormUrl(data) {
  const u = new URL(ISSUE_ROOT + '/new');
  u.search = new URLSearchParams({template: data.kind === 'restaurant' ? 'restaurant-request.yml' : 'menu-tip.yml', title: `[${data.kind === 'restaurant' ? '식당 등록' : '메뉴 제보'}] ${data.restaurant_name}`, restaurant_name: data.restaurant_name, address: data.address, menu_url: data.menu_url, note: data.note}).toString();
  return u.href;
}
async function submit(event) {
  event.preventDefault();
  if (!byId('submission-form').reportValidity()) return;
  const menu = publicMenuUrl(byId('menu-url').value);
  if (!menu) { status('로그인 정보가 포함되지 않은 공개 https 메뉴 링크를 입력해 주세요.'); return; }
  const data = {kind: byId('submission-kind').value, restaurant_name: byId('restaurant-name').value.trim(), address: byId('restaurant-address').value.trim(), menu_url: menu, note: byId('submission-note').value.trim(), website: byId('website').value, consent: byId('public-consent').checked};
  if (/(?:ghp_|github_pat_|glpat-)[A-Za-z0-9_-]{15,}|AIza[A-Za-z0-9_-]{25,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(JSON.stringify(data))) { status('인증 키나 토큰으로 보이는 내용은 공개 제보에 넣을 수 없습니다.'); return; }
  if (!data.restaurant_name || (data.kind === 'restaurant' && !data.address)) { status('식당 이름과 주소를 확인해 주세요.'); return; }
  if (mode() === 'github') { const target = issueFormUrl(data); if (target.length > 7500) { status('메뉴 링크나 추가 설명을 조금 짧게 적어 주세요.'); return; } window.location.assign(target); return; }
  if (!anonymousReady()) { status('비회원 제보는 아직 준비 중입니다.'); return; }
  data.captcha = window.turnstile && widgetId !== undefined ? window.turnstile.getResponse(widgetId) : '';
  if (!data.captcha) { status('보안 확인을 완료해 주세요.'); return; }
  byId('submit-button').disabled = true; status('제보를 접수하고 있습니다.');
  try {
    const r = await fetch(communityConfig.anonymous_endpoint, {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data), signal: AbortSignal.timeout(25000)});
    const result = await r.json();
    if (!r.ok || !result.issue_url || !/^https:\/\/github\.com\/inchency\/today-buffet\/issues\/\d+$/.test(result.issue_url)) throw new Error(r.status === 429 ? 'rate_limit' : 'failed');
    byId('submission-form').reset(); updateMode(); status('제보가 접수되었습니다. 지점과 메뉴를 확인한 뒤 반영하겠습니다.'); await loadBoard(true);
  } catch (e) { status(e.message === 'rate_limit' ? '잠시 뒤 다시 제보해 주세요.' : '제보를 접수하지 못했습니다. 입력 내용은 유지됩니다. 잠시 뒤 다시 시도해 주세요.'); }
  finally { byId('submit-button').disabled = false; resetWidget(); }
}
let lastBoardLoad = 0;
async function loadBoard(force = false) {
  if (force && Date.now() - lastBoardLoad < 5000) return;
  lastBoardLoad = Date.now(); byId('reload-board').disabled = true;
  try {
    const r = await fetch(ISSUE_API, {headers: {'Accept':'application/vnd.github+json'}, signal: AbortSignal.timeout(10000)});
    if (!r.ok) throw new Error('unavailable');
    const items = await r.json(); if (!Array.isArray(items)) throw new Error('invalid');
    const list = byId('submission-list'); list.replaceChildren();
    for (const item of items.filter(x => !x.pull_request && /^https:\/\/github\.com\/inchency\/today-buffet\/issues\/\d+$/.test(x.html_url || '')).slice(0,20)) {
      const card = document.createElement('article'); card.className = 'submission-card';
      const a = document.createElement('a'); a.textContent = String(item.title || '').slice(0,180); a.href = item.html_url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      const meta = document.createElement('p'); meta.className = 'fine-print'; meta.textContent = `#${item.number} · ${item.state === 'closed' ? '처리 종료' : '확인 대기'} · ${String(item.created_at || '').slice(0,10)}`;
      card.append(a,meta); list.append(card);
    }
    if (!list.childElementCount) list.textContent = '아직 제보가 없습니다. 첫 점심 정보를 나눠 주세요.';
  } catch { byId('submission-list').textContent = '제보 목록을 불러오지 못했습니다. 아래 전체 제보 링크에서 확인해 주세요.'; }
  finally { byId('reload-board').disabled = false; }
}
byId('submission-form').addEventListener('submit', submit);
document.querySelectorAll('input[name="mode"]').forEach(x => x.addEventListener('change', updateMode));
byId('submission-kind').addEventListener('change', () => { const required = byId('submission-kind').value === 'restaurant'; byId('restaurant-address').required = required; byId('address-required').hidden = !required; });
byId('reload-board').addEventListener('click', () => loadBoard(true));
const params = new URLSearchParams(location.search);
if (!byId('restaurant-name').value) byId('restaurant-name').value = (params.get('restaurant') || '').slice(0,80);
if (params.get('kind') === 'menu') { byId('submission-kind').value = 'menu'; byId('submission-kind').dispatchEvent(new Event('change')); }
updateMode();
fetch('./data/community.json', {signal:AbortSignal.timeout(10000)}).then(r => { if (!r.ok) throw new Error('config'); return r.json(); }).then(c => { communityConfig = {anonymous_endpoint: c.anonymous_endpoint || '', turnstile_site_key: c.turnstile_site_key || ''}; updateMode(); }).catch(updateMode);
loadBoard();
