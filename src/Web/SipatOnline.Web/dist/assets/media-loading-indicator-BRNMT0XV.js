import{G as _,n as L,M as d,a as e,i as M,g as m,s as A,d as O,e as f}from"./element-utils-BreoY0te.js";import{t as T}from"./i18n-BvMjJdGg.js";var I=(a,t,i)=>{if(!t.has(a))throw TypeError("Cannot "+i)},r=(a,t,i)=>(I(a,t,"read from private field"),i?i.call(a):t.get(a)),p=(a,t,i)=>{if(t.has(a))throw TypeError("Cannot add the same private member more than once");t instanceof WeakSet?t.add(a):t.set(a,i)},l=(a,t,i,s)=>(I(a,t,"write to private field"),t.set(a,i),i),o,h;const c={LOADING_DELAY:"loadingdelay",NO_AUTOHIDE:"noautohide"},y=500,N=`
<svg aria-hidden="true" viewBox="0 0 100 100">
  <path d="M73,50c0-12.7-10.3-23-23-23S27,37.3,27,50 M30.9,50c0-10.5,8.5-19.1,19.1-19.1S69.1,39.5,69.1,50">
    <animateTransform
       attributeName="transform"
       attributeType="XML"
       type="rotate"
       dur="1s"
       from="0 50 50"
       to="360 50 50"
       repeatCount="indefinite" />
  </path>
</svg>
`;function b(a){return`
    <style>
      :host {
        display: var(--media-control-display, var(--media-loading-indicator-display, inline-block));
        vertical-align: middle;
        box-sizing: border-box;
        --_loading-indicator-delay: var(--media-loading-indicator-transition-delay, ${y}ms);
      }

      #status {
        color: rgba(0,0,0,0);
        width: 0px;
        height: 0px;
      }

      :host slot[name=icon] > *,
      :host ::slotted([slot=icon]) {
        opacity: var(--media-loading-indicator-opacity, 0);
        transition: opacity 0.15s;
      }

      :host([${e.MEDIA_LOADING}]:not([${e.MEDIA_PAUSED}])) slot[name=icon] > *,
      :host([${e.MEDIA_LOADING}]:not([${e.MEDIA_PAUSED}])) ::slotted([slot=icon]) {
        opacity: var(--media-loading-indicator-opacity, 1);
        transition: opacity 0.15s var(--_loading-indicator-delay);
      }

      :host #status {
        visibility: var(--media-loading-indicator-opacity, hidden);
        transition: visibility 0.15s;
      }

      :host([${e.MEDIA_LOADING}]:not([${e.MEDIA_PAUSED}])) #status {
        visibility: var(--media-loading-indicator-opacity, visible);
        transition: visibility 0.15s var(--_loading-indicator-delay);
      }

      svg, img, ::slotted(svg), ::slotted(img) {
        width: var(--media-loading-indicator-icon-width);
        height: var(--media-loading-indicator-icon-height, 100px);
        fill: var(--media-icon-color, var(--media-primary-color, rgb(238 238 238)));
        vertical-align: middle;
      }
    </style>

    <slot name="icon">${N}</slot>
    <div id="status" role="status" aria-live="polite">${T("media loading")}</div>
  `}class g extends _.HTMLElement{constructor(){if(super(),p(this,o,void 0),p(this,h,y),!this.shadowRoot){this.attachShadow(this.constructor.shadowRootOptions);const t=L(this.attributes);this.shadowRoot.innerHTML=this.constructor.getTemplateHTML(t)}}static get observedAttributes(){return[d.MEDIA_CONTROLLER,e.MEDIA_PAUSED,e.MEDIA_LOADING,c.LOADING_DELAY]}attributeChangedCallback(t,i,s){var n,u,E,v,D;t===c.LOADING_DELAY&&i!==s?this.loadingDelay=Number(s):t===d.MEDIA_CONTROLLER&&(i&&((u=(n=r(this,o))==null?void 0:n.unassociateElement)==null||u.call(n,this),l(this,o,null)),s&&this.isConnected&&(l(this,o,(E=this.getRootNode())==null?void 0:E.getElementById(s)),(D=(v=r(this,o))==null?void 0:v.associateElement)==null||D.call(v,this)))}connectedCallback(){var t,i,s;const n=this.getAttribute(d.MEDIA_CONTROLLER);n&&(l(this,o,(t=this.getRootNode())==null?void 0:t.getElementById(n)),(s=(i=r(this,o))==null?void 0:i.associateElement)==null||s.call(i,this))}disconnectedCallback(){var t,i;(i=(t=r(this,o))==null?void 0:t.unassociateElement)==null||i.call(t,this),l(this,o,null)}get loadingDelay(){return r(this,h)}set loadingDelay(t){l(this,h,t);const{style:i}=M(this.shadowRoot,":host");i.setProperty("--_loading-indicator-delay",`var(--media-loading-indicator-transition-delay, ${t}ms)`)}get mediaPaused(){return m(this,e.MEDIA_PAUSED)}set mediaPaused(t){A(this,e.MEDIA_PAUSED,t)}get mediaLoading(){return m(this,e.MEDIA_LOADING)}set mediaLoading(t){A(this,e.MEDIA_LOADING,t)}get mediaController(){return O(this,d.MEDIA_CONTROLLER)}set mediaController(t){f(this,d.MEDIA_CONTROLLER,t)}get noAutohide(){return m(this,c.NO_AUTOHIDE)}set noAutohide(t){A(this,c.NO_AUTOHIDE,t)}}o=new WeakMap;h=new WeakMap;g.shadowRootOptions={mode:"open"};g.getTemplateHTML=b;_.customElements.get("media-loading-indicator")||_.customElements.define("media-loading-indicator",g);var S=g;export{c as Attributes,S as default};
