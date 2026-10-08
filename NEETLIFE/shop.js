// NEETLIFE — NeetMart: an online shop on the PC for clothes and accessories.
// The catalogue and the drawing of each item live in character.js (NEET.wardrobe); this is the store front.
(() => {
'use strict';
const N = window.NEET;
if (!N || !N.wardrobe) return;
const WD = N.wardrobe;

const TABS = [['clothes', 'Clothes'], ['hats', 'Hats'], ['glasses', 'Glasses'], ['chains', 'Chains'], ['pins', 'Pins']];
let tab = 'clothes';

const css = document.createElement('style');
css.textContent = `
  .nm-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .nm-head h3 { margin: 0; } .nm-bal { font-weight: 800; color: #1b8a4a; }
  .nm-tabs { display: flex; gap: 6px; margin: 12px 0; flex-wrap: wrap; }
  .nm-tabs button { font: inherit; font-weight: 800; font-size: 13px; border: 2px solid #24223a; background: #fff; color: #24223a; border-radius: 99px; padding: 6px 14px; cursor: pointer; }
  .nm-tabs button.on { background: #24223a; color: #ffcf5a; }
  .nm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
  .nm-card { background: #fff; border: 1px solid #ddd9cf; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
  .nm-card .ic { font-size: 34px; line-height: 1; }
  .nm-card .nm { font-weight: 800; font-size: 15px; }
  .nm-card .ds { font-size: 12px; color: #6a6880; flex: 1; }
  .nm-card .row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .nm-card .pr { font-weight: 900; font-size: 16px; }
  .nm-card .own { font-size: 12px; font-weight: 800; color: #1b8a4a; }
  .nm-sale { background: linear-gradient(90deg, #ffcf5a, #ff9a6b); color: #1b1405; font-weight: 800; font-size: 12px; padding: 6px 10px; border-radius: 8px; margin-top: 4px; }`;
document.head.appendChild(css);

function render(body) {
  const S = N.S, items = WD.CATALOG.filter(i => i.cat === tab);
  body.innerHTML = `<div class="nm-head"><h3>NeetMart 🛍</h3><span class="nm-bal">Balance ${N.money(S.money)}</span></div>
    <p>Free same-minute delivery. Try things on at your bathroom mirror.</p>
    <div class="nm-tabs">${TABS.map(([id, l]) => `<button data-tab="${id}" class="${tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${tab === 'pins' ? '<div class="nm-sale">Pins stick anywhere: shirt, sleeve, hat, pants, even your face. Buy as many as you like.</div><br>' : ''}
    <div class="nm-grid">${items.map(it => {
      const owned = !it.pin && WD.owns(it.id), have = it.pin ? WD.pinCount(it.pin) : 0;
      const can = S.money >= it.price && !owned;
      return `<div class="nm-card"><div class="ic">${it.icon}</div><div class="nm">${it.name}</div><div class="ds">${it.desc}</div>
        <div class="row"><span class="pr">$${it.price.toLocaleString()}</span>
        ${owned ? '<span class="own">✓ Owned</span>' : `<button class="wbtn ${can ? 'gold' : ''}" data-buy="${it.id}" ${can ? '' : 'disabled'}>Buy</button>`}</div>
        ${it.pin && have ? `<span class="own">You have ${have}</span>` : ''}</div>`;
    }).join('')}</div>`;
  body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(body); });
  body.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => buy(b.dataset.buy, body));
}

function buy(id, body) {
  const it = WD.CATALOG.find(x => x.id === id), S = N.S;
  if (!it || S.money < it.price || (!it.pin && WD.owns(it.id))) return;
  N.addMoney(-it.price, `NeetMart: ${it.name}`);
  WD.give(it);
  const where = it.pin ? 'Place it at the bathroom mirror.'
    : ['hat', 'glasses', 'neck'].includes(it.slot) ? "It's on! Check it out at the bathroom mirror."
    : 'Change into it at the bathroom mirror.';
  N.toast(`${it.name} delivered. ${where}`, 'good', 4500);
  render(body);
}

N.pcAddApp('shop', '🛍', 'NeetMart', 'linear-gradient(135deg,#b98cff,#ff6ec7)', render);
})();
