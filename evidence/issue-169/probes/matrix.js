(async function ({ page, tab }, options) {
  const fs = await import('node:fs/promises');
  await fs.mkdir(options.directory, { recursive: true });
  const records = [], errors = [];
  const planned = options.scenarios.flatMap(s => ['home', ...s.kinds].map(kind => ({key:[s.style,s.theme,s.width,s.height].join('-'),kind})));
  const save = () => fs.writeFile(options.directory+'/results.json', JSON.stringify({planned,records,errors},null,2));
  const stable = async () => {
    await page.waitForFunction(() => document.fonts.status==='loaded' && document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).every(a=>a.playState==='finished'||a.playState==='idle'), {timeout:10000});
    await page.evaluate(async () => {
      const {promise,resolve}=Promise.withResolvers();
      requestAnimationFrame(()=>requestAnimationFrame(resolve));
      await promise;
    });
  };
  const capture = async (key,kind,scenario,selector=null) => {
    await stable();
    const geometry = await page.evaluate(({kind,selector}) => {
      const rect=e=>e?Object.fromEntries(['x','y','width','height','top','right','bottom','left'].map(k=>[k,e.getBoundingClientRect()[k]])):null;
      const visible=e=>!!e && !e.closest('[inert]') && getComputedStyle(e).visibility!=='hidden' && e.getBoundingClientRect().width>0 && e.getBoundingClientRect().height>0;
      const surface=selector?document.querySelector(selector):null;
      const scrolls=surface?[...surface.querySelectorAll('.workspace-body,.document-editor-scroll-area,.note-body-scroll,.note-live-editor,textarea,.app-dialog-body')].filter(visible).map(e=>({class:e.className,rect:rect(e),height:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop,overflow:getComputedStyle(e).overflowY})):[];
      const chrome=surface?.querySelector('.desktop-window-chrome,.workspace-header');
      const controls=chrome?[...chrome.querySelectorAll('button')].filter(visible).map(e=>{const r=rect(e);const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{label:e.getAttribute('aria-label')||e.textContent.trim(),rect:r,hit:!!hit&&(hit===e||e.contains(hit)),disabled:e.disabled}}):[];
      const sample=document.createElement('div');
      sample.style.cssText='position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.append(sample);
      const cs=getComputedStyle(sample);
      const safeArea={top:cs.paddingTop,right:cs.paddingRight,bottom:cs.paddingBottom,left:cs.paddingLeft};
      sample.remove();
      return{width:innerWidth,height:innerHeight,theme:document.documentElement.dataset.theme,homeClass:document.querySelector('.home')?.className,search:rect(document.querySelector('.search-form-wrap')),surface:rect(surface),surfaceVisible:visible(surface),presentation:surface?.classList.contains('desktop-window')?'window':surface?.dataset.presentation||null,dock:rect(document.querySelector('.desktop-dock')),documentOverflow:document.documentElement.scrollWidth-innerWidth,bodyOverflow:document.body.scrollWidth-innerWidth,active:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')},viewport:{height:visualViewport?.height,width:visualViewport?.width,offsetTop:visualViewport?.offsetTop,scale:visualViewport?.scale},safeArea,controls,scrolls};
    },{kind,selector});
    const expectedPresentation=kind==='home'?null:scenario.width<768?'sheet':scenario.style==='zen'?'panel':scenario.width>=1024&&scenario.height<300&&geometry.presentation==='panel'?'panel':'window';
    const checks={noHorizontalOverflow:geometry.documentOverflow<=1&&geometry.bodyOverflow<=1,presenterMatches:geometry.presentation===expectedPresentation,visibleSurface:kind==='home'||geometry.surfaceVisible,chromeControlsHit:geometry.controls.filter(c=>!c.disabled).every(c=>c.hit)};
    const screenshot=key+'-'+kind+'.png';
    await page.screenshot({path:options.directory+'/'+screenshot,fullPage:false});
    records.push({key,kind,scenario,screenshot,geometry,checks});
    await save();
  };
  for(const scenario of options.scenarios){
    const{style,theme,width,height,kinds}=scenario;
    const key=[style,theme,width,height].join('-');
    let stage='setup',kind='home';
    try{
      await page.setViewport({width,height,isMobile:width<768,hasTouch:width<768,deviceScaleFactor:1});
      await page.goto(options.origin+'/settings/appearance',{waitUntil:'domcontentloaded'});
      await page.waitForSelector('[role="radio"]',{visible:true,timeout:15000});
      await page.evaluate(async({style,theme,userId})=>{
        const r=await fetch('/api/preferences',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({style,theme})});
        if(!r.ok)throw Error(await r.text());
        const{promise,resolve,reject}=Promise.withResolvers();
        const request=indexedDB.open('searcher-client',1);
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('state')){db.close();resolve();return;}const tx=db.transaction('state','readwrite');tx.objectStore('state').delete('searcher:desktop-layout:v1:'+userId);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}};
        await promise;
      },{style,theme,userId:options.userId});
      await page.goto(options.origin+'/',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(({style,theme})=>!!document.querySelector('.home-'+style)&&document.documentElement.dataset.theme===theme,{timeout:15000},{style,theme});
      await page.waitForFunction(()=>document.querySelectorAll('[data-app-id]').length>=7&&document.querySelectorAll('.note-card').length>=3,{timeout:15000});
      stage='capture';await capture(key,'home',scenario);
      for(kind of kinds){
        stage='open';
        const trigger=style==='zen'?'.zen-edge-trigger [data-workspace="'+kind+'"]':width>=768?'.desktop-dock [data-workspace="'+kind+'"]':'.workspace-mobile-navigation [data-workspace="'+kind+'"]';
        await tab.click(trigger);
        const windowSelector='.desktop-window[data-window-id="'+kind+'"]:not(.desktop-window--minimized)';
        await page.waitForFunction((w)=>{const e=document.querySelector(w)||document.querySelector('.workspace-panel');return !!e&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;},{timeout:15000},windowSelector);
        const selector=await page.evaluate(w=>{const e=document.querySelector(w);return e&&e.getBoundingClientRect().width>0?w:'.workspace-panel'},windowSelector);
        const content=kind==='apps'?'.apps-workspace-root':kind==='notes'?'.notes-workspace':'.documents-workspace';
        await page.waitForSelector(selector+' '+content,{visible:true,timeout:15000});
        await page.waitForFunction(({selector,kind})=>{const e=document.querySelector(selector);return e&&(kind==='apps'?e.querySelectorAll('[data-app-id]').length>=7:kind==='notes'?e.textContent.includes('审计便签 1')&&e.textContent.includes('审计便签 3'):e.textContent.includes('审计笔记—分页/长内容/工具栏'));},{timeout:15000},{selector,kind});
        stage='capture';await capture(key,kind,scenario,selector);
        stage='close';
        const close=selector+(selector.startsWith('.desktop-window')?' .desktop-window-chrome-btn--close':' .workspace-header button[aria-label="收起工作区"]');
        await tab.click(close);
        await page.waitForFunction(s=>{const e=document.querySelector(s);return !e||getComputedStyle(e).display==='none'||getComputedStyle(e).visibility==='hidden';},{timeout:15000},selector);
      }
    }catch(error){
      errors.push({key,kind,stage,message:String(error),stack:error?.stack});
      await save();
      try{await page.screenshot({path:options.directory+'/'+key+'-error.png',fullPage:false})}catch(captureError){errors.push({key,kind,stage:'error-screenshot',message:String(captureError)});await save()}
    }
  }
  const violations=records.flatMap(r=>Object.entries(r.checks).filter(([,ok])=>!ok).map(([check])=>({key:r.key,kind:r.kind,check})));
  const skipped=planned.filter(p=>!records.some(r=>r.key===p.key&&r.kind===p.kind));
  return{planned:planned.length,completed:records.length,errors,violations,skipped};
})
