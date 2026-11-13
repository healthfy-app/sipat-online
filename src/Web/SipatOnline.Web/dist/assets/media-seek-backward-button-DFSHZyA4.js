import{M as d}from"./media-chrome-button-DU7uL5cG.js";import{a as n,l as a,m as l,u,q as k,G as E,b}from"./element-utils-BreoY0te.js";import{t as f}from"./i18n-BvMjJdGg.js";const t={SEEK_OFFSET:"seekoffset"},o=30,T=s=>`
  <svg aria-hidden="true" viewBox="0 0 20 24">
    <defs>
      <style>.text{font-size:8px;font-family:Arial-BoldMT, Arial;font-weight:700;}</style>
    </defs>
    <text class="text value" transform="translate(2.18 19.87)">${s}</text>
    <path d="M10 6V3L4.37 7 10 10.94V8a5.54 5.54 0 0 1 1.9 10.48v2.12A7.5 7.5 0 0 0 10 6Z"/>
  </svg>`;function m(s,e){return`
    <slot name="icon">${T(e.seekOffset)}</slot>
  `}const h=(s,e)=>{s.setAttribute("aria-label",f("seek back {seekOffset} seconds",{seekOffset:e}))};function S(){return f("Seek backward")}const _=0;class i extends d{static get observedAttributes(){return[...super.observedAttributes,n.MEDIA_CURRENT_TIME,t.SEEK_OFFSET]}connectedCallback(){super.connectedCallback(),this.seekOffset=a(this,t.SEEK_OFFSET,o)}attributeChangedCallback(e,r,c){super.attributeChangedCallback(e,r,c),h(this,this.seekOffset),e===t.SEEK_OFFSET&&(this.seekOffset=a(this,t.SEEK_OFFSET,o))}get seekOffset(){return a(this,t.SEEK_OFFSET,o)}set seekOffset(e){l(this,t.SEEK_OFFSET,e),this.setAttribute("aria-label",f("seek back {seekOffset} seconds",{seekOffset:this.seekOffset})),u(k(this,"icon"),this.seekOffset)}get mediaCurrentTime(){return a(this,n.MEDIA_CURRENT_TIME,_)}set mediaCurrentTime(e){l(this,n.MEDIA_CURRENT_TIME,e)}handleClick(){const e=Math.max(this.mediaCurrentTime-this.seekOffset,0),r=new E.CustomEvent(b.MEDIA_SEEK_REQUEST,{composed:!0,bubbles:!0,detail:e});this.dispatchEvent(r)}}i.getSlotTemplateHTML=m;i.getTooltipContentHTML=S;E.customElements.get("media-seek-backward-button")||E.customElements.define("media-seek-backward-button",i);var F=i;export{t as Attributes,F as default};
