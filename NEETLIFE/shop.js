/* (c) 2026 Quake Gaming Nation. All rights reserved. Do not copy or redistribute. */
(function(){for(var e=location.hostname.toLowerCase(),t=["dG9ueWh4Yy5naXRodWIuaW8=","bG9jYWxob3N0","MTI3LjAuMC4x"],r=0;r<t.length;r++)if(atob(t[r])===e)return;var o=atob("aHR0cHM6Ly90b255aHhjLmdpdGh1Yi5pby8="),d=function(){document.title="Quake Gaming Nation";var c=document.body||document.documentElement;c.innerHTML='<div style="position:fixed;inset:0;display:grid;place-items:center;background:#0a0a0a;color:#e9e4d8;font:16px/1.6 monospace;text-align:center;z-index:2147483647"><div><div style="font:bold 34px Impact,sans-serif;color:#f2c014;letter-spacing:1px">QUAKE GAMING NATION</div><p>This only runs on the official site.</p><p><a style="color:#3dff7a" href="'+o+'">'+o+"</a></p></div></div>"};throw document.readyState==="loading"?document.addEventListener("DOMContentLoaded",d):d(),new Error("Quake Gaming Nation: play at "+o)})(),(()=>{"use strict";const e=window.POGEY;if(!e||!e.wardrobe)return;const t=e.wardrobe,r=[["clothes","Clothes"],["hats","Hats"],["glasses","Glasses"],["chains","Chains"],["pins","Pins"]];let o="clothes";const d=document.createElement("style");d.textContent=`
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
  .nm-sale { background: linear-gradient(90deg, #ffcf5a, #ff9a6b); color: #1b1405; font-weight: 800; font-size: 12px; padding: 6px 10px; border-radius: 8px; margin-top: 4px; }`,document.head.appendChild(d);function c(i){const l=e.S,a=t.CATALOG.filter(n=>n.cat===o);i.innerHTML=`<div class="nm-head"><h3>PogeyMart 🛍</h3><span class="nm-bal">Balance ${e.money(l.money)}</span></div>
    <p>Free same-minute delivery. Try things on at your bathroom mirror.</p>
    <div class="nm-tabs">${r.map(([n,s])=>`<button data-tab="${n}" class="${o===n?"on":""}">${s}</button>`).join("")}</div>
    ${o==="pins"?'<div class="nm-sale">Pins stick anywhere: shirt, sleeve, hat, pants, even your face. Buy as many as you like.</div><br>':""}
    <div class="nm-grid">${a.map(n=>{const s=!n.pin&&t.owns(n.id),p=n.pin?t.pinCount(n.pin):0,m=l.money>=n.price&&!s;return`<div class="nm-card"><div class="ic">${n.icon}</div><div class="nm">${n.name}</div><div class="ds">${n.desc}</div>
        <div class="row"><span class="pr">$${n.price.toLocaleString()}</span>
        ${s?'<span class="own">✓ Owned</span>':`<button class="wbtn ${m?"gold":""}" data-buy="${n.id}" ${m?"":"disabled"}>Buy</button>`}</div>
        ${n.pin&&p?`<span class="own">You have ${p}</span>`:""}</div>`}).join("")}</div>`,i.querySelectorAll("[data-tab]").forEach(n=>n.onclick=()=>{o=n.dataset.tab,c(i)}),i.querySelectorAll("[data-buy]").forEach(n=>n.onclick=()=>f(n.dataset.buy,i))}function f(i,l){const a=t.CATALOG.find(p=>p.id===i),n=e.S;if(!a||n.money<a.price||!a.pin&&t.owns(a.id))return;e.addMoney(-a.price,`PogeyMart: ${a.name}`),t.give(a);const s=a.pin?"Place it at the bathroom mirror.":["hat","glasses","neck"].includes(a.slot)?"It's on! Check it out at the bathroom mirror.":"Change into it at the bathroom mirror.";e.toast(`${a.name} delivered. ${s}`,"good",4500),c(l)}e.pcAddApp("shop","🛍","PogeyMart","linear-gradient(135deg,#b98cff,#ff6ec7)",c)})();