const PREVIEW_SHARED_ROOT_DIRS = [
  'images',
  'figure-images',
  'fonts',
  'mathbook-assets',
  'static',
  'theme',
  'theme-duke',
  'theme-gt',
  'theme-vanderbilt',
];

const PREVIEW_SKIP_URL_PATTERN = /^(?:[a-zA-Z][a-zA-Z\d+.-]*:|\/|#|\?|\.\.?\/)/;
const MATHJAX_ASSET_URL = '/assets/mathjax/tex-svg.js';

const rewriteAbsolutePreviewUrls = (content, sessionBase) =>
  content
    .replace(/(href|src|action|poster)="\//g, `$1="${sessionBase}`)
    .replace(/url\(\//g, `url(${sessionBase}`)
    .replace(/url\('\//g, `url('${sessionBase}`)
    .replace(/url\("\//g, `url("${sessionBase}`)
    .replace(/@import url\("\//g, `@import url("${sessionBase}`);

const rewriteBareRelativeAttributes = (content, sessionBase) =>
  content.replace(
    /((?:href|src|action|poster)=["'])([^"']+)(["'])/g,
    (match, prefix, url, suffix) => {
      if (PREVIEW_SKIP_URL_PATTERN.test(url)) {
        return match;
      }

      return `${prefix}${sessionBase}${url}${suffix}`;
    }
  );

const rewriteCssUrls = (content, sessionBase, allowedRelativeDirs = []) => {
  const shouldRewriteRelativeUrl = (url) =>
    allowedRelativeDirs.some((dir) => url.startsWith(`${dir}/`));

  return content.replace(
    /url\((['"]?)([^)"']+)\1\)/g,
    (match, quote, url) => {
      if (url.startsWith(sessionBase)) {
        return match;
      }

      if (PREVIEW_SKIP_URL_PATTERN.test(url)) {
        if (!url.startsWith('/')) {
          return match;
        }

        const nextUrl = `${sessionBase}${url.slice(1)}`;
        return `url(${quote}${nextUrl}${quote})`;
      }

      if (!shouldRewriteRelativeUrl(url)) {
        return match;
      }

      return `url(${quote}${sessionBase}${url}${quote})`;
    }
  );
};

const PROOFDESK_PRETEX_LAYOUT_FIX_VERSION = '2026-04-21-display-math-reserve-v4';

const PROOFDESK_PRETEX_LAYOUT_FIX = String.raw`
<style id="proofdesk-pretex-layout-fix" data-proofdesk-pretex-layout-version="${PROOFDESK_PRETEX_LAYOUT_FIX_VERSION}">
.mathbook-content .pretex-display,
.pretex-display{
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  justify-content:center!important;
  clear:both!important;
  position:relative!important;
  width:100%!important;
  max-width:100%!important;
  box-sizing:border-box!important;
  min-height:var(--proofdesk-pretex-display-height, 2.5em);
  margin:2em 0!important;
  padding:0.8em 0!important;
  line-height:1.5!important;
  text-align:center!important;
  text-indent:0!important;
  float:none!important;
  overflow-x:auto!important;
  overflow-y:visible!important;
  isolation:isolate!important;
  contain:layout;
}
.mathbook-content li>.pretex-display,
li>.pretex-display{
  margin:1em 0!important;
}
.mathbook-content .pretex-display+*,
.pretex-display+*{
  clear:both!important;
}
.pretex-display::after{
  content:"";
  display:block;
  clear:both;
}
.mathbook-content .pretex-display>svg.pretex,
.pretex-display>svg.pretex{
  display:block!important;
  position:static!important;
  float:none!important;
  max-width:100%!important;
  height:auto!important;
  margin:0 auto!important;
  vertical-align:baseline!important;
  overflow:visible!important;
}
.pretex-bind{
  display:inline-block!important;
  vertical-align:middle!important;
  line-height:0;
}
.pretex-inline{
  display:inline-block!important;
  vertical-align:middle!important;
}
mjx-container{
  max-width:100%!important;
  line-height:normal!important;
  overflow-x:auto!important;
  overflow-y:visible!important;
}
mjx-container[display="true"]{
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  justify-content:center!important;
  clear:both!important;
  width:100%!important;
  max-width:100%!important;
  box-sizing:border-box!important;
  min-height:var(--proofdesk-mathjax-display-height, 2.5em);
  margin:2em auto!important;
  padding:1em 0!important;
  line-height:1.5!important;
  text-align:center!important;
  overflow-x:auto!important;
  overflow-y:visible!important;
  contain:layout;
}
mjx-container[display="true"]>svg{
  display:block!important;
  max-width:100%!important;
  height:auto!important;
  margin:0 auto!important;
}
</style>
<script id="proofdesk-pretex-layout-guard">
(function(){
  'use strict';

  function toPx(value, context){
    if(!value) return 0;
    var match=String(value).trim().match(/^([0-9]*\.?[0-9]+)(px|em|rem)?$/);
    if(!match) return 0;
    var n=parseFloat(match[1]);
    var unit=match[2]||'px';
    if(unit==='px') return n;
    var basis=16;
    if(unit==='em'&&context){
      basis=parseFloat(window.getComputedStyle(context).fontSize)||basis;
    } else if(unit==='rem') {
      basis=parseFloat(window.getComputedStyle(document.documentElement).fontSize)||basis;
    }
    return n*basis;
  }

  function getViewBox(svg){
    var base=svg.viewBox&&svg.viewBox.baseVal;
    if(base&&base.width&&base.height){
      return {x:base.x||0,y:base.y||0,width:base.width,height:base.height};
    }
    var attr=svg.getAttribute('viewBox');
    if(!attr) return null;
    var parts=attr.trim().split(/[\s,]+/).map(parseFloat);
    if(parts.length!==4||parts.some(function(n){return !isFinite(n);})) return null;
    return {x:parts[0],y:parts[1],width:parts[2],height:parts[3]};
  }

  function getSvgVisualHeight(svg, context){
    var rect=svg.getBoundingClientRect();
    var attrHeight=toPx(svg.getAttribute('height'), context);
    var height=Math.max(rect.height||0, attrHeight||0);

    try{
      var box=svg.getBBox();
      var viewBox=getViewBox(svg);
      if(box&&viewBox&&viewBox.height){
        var basis=rect.height||attrHeight||viewBox.height;
        var scaleY=basis/viewBox.height;
        height=Math.max(height, Math.ceil(box.height*scaleY));
      }
    } catch (_) { }

    return height;
  }

  function reserveSvg(display, svg){
    svg.style.display='block';
    svg.style.position='static';
    svg.style.float='none';
    svg.style.maxWidth='100%';
    svg.style.height='auto';
    svg.style.marginLeft='auto';
    svg.style.marginRight='auto';
    svg.style.verticalAlign='baseline';
    svg.style.overflow='visible';

    var height=getSvgVisualHeight(svg, display);
    if(height>5){
      display.style.setProperty('--proofdesk-pretex-display-height', Math.ceil(height)+'px');
    }
  }

  function reserveDisplayMath(root){
    var scope=root&&root.querySelectorAll?root:document;
    var displays=Array.from(scope.querySelectorAll('.pretex-display'));
    if(scope.classList&&scope.classList.contains('pretex-display')) displays.unshift(scope);
    displays.forEach(function(display){
      display.style.display='flex';
      display.style.flexDirection='column';
      display.style.alignItems='center';
      display.style.justifyContent='center';
      display.style.clear='both';
      display.style.position='relative';
      display.style.width='100%';
      display.style.maxWidth='100%';
      display.style.boxSizing='border-box';
      display.style.lineHeight='1.5';
      display.style.textAlign='center';
      display.style.textIndent='0';
      display.style.float='none';
      display.style.overflowX='auto';
      display.style.overflowY='visible';

      Array.from(display.children).forEach(function(child){
        if(child.matches&&child.matches('svg.pretex')) reserveSvg(display, child);
      });
    });

    Array.from(scope.querySelectorAll('mjx-container[display="true"]')).forEach(function(math){
      math.style.display='flex';
      math.style.flexDirection='column';
      math.style.alignItems='center';
      math.style.justifyContent='center';
      math.style.clear='both';
      math.style.width='100%';
      math.style.maxWidth='100%';
      math.style.boxSizing='border-box';
      math.style.lineHeight='1.5';
      math.style.textAlign='center';
      math.style.overflowX='auto';
      math.style.overflowY='visible';

      var svg=math.querySelector(':scope > svg');
      if(svg){
        svg.style.display='block';
        svg.style.maxWidth='100%';
        svg.style.height='auto';
        svg.style.marginLeft='auto';
        svg.style.marginRight='auto';
        var height=getSvgVisualHeight(svg, math);
        if(height>5){
          math.style.setProperty('--proofdesk-mathjax-display-height', Math.ceil(height)+'px');
        }
      }
    });
  }

  var retryDelays = [50, 150, 400, 1000, 2500, 5000, 8000];
  function schedule(root){
    reserveDisplayMath(root);
    retryDelays.forEach(function(delay){
      window.setTimeout(function(){ reserveDisplayMath(root); }, delay);
    });
  }

  function init(){
    schedule(document);
    var observer=new MutationObserver(function(mutations){
      mutations.forEach(function(mutation){
        mutation.addedNodes.forEach(function(node){
          if(node.nodeType===1) schedule(node);
        });
      });
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    
    // Listen for MathJax render signals if possible
    window.addEventListener('load', function(){ schedule(document); });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  } else {
    init();
  }
})();
</script>`;

const pretexFallback = String.raw`
<script>
(function(){
  'use strict';
  var mjaxReady=false, observing=false;

  function splitTopLevel(text, delimiter){
    var parts=[], depth=0, start=0;
    for(var i=0;i<text.length;i++){
      var ch=text[i];
      if(ch==='\\'){ i++; continue; }
      if(ch==='{') depth++;
      else if(ch==='}') depth=Math.max(0, depth-1);
      else if(ch===delimiter && depth===0){
        parts.push(text.slice(start,i));
        start=i+1;
      }
    }
    parts.push(text.slice(start));
    return parts;
  }

  function findMatchingBrace(text, openIndex){
    var depth=0;
    for(var i=openIndex;i<text.length;i++){
      var ch=text[i];
      if(ch==='\\'){ i++; continue; }
      if(ch==='{') depth++;
      else if(ch==='}'){
        depth--;
        if(depth===0) return i;
      }
    }
    return -1;
  }

  function formatSyseqRow(row){
    var next=row
      .replace(/\\amp/g, '&')
      .replace(/\\\./g, '{}')
      .replace(/\\\+/g, '+')
      .replace(/\\rlap\{([^}]*)\}/g, '$1')
      .replace(/\\rlap\./g, '.')
      .replace(/\\[rb]\b/g, '')
      .trim();

    if(!next) return '';
    if(next.indexOf('&')===-1) next=next.replace(/\s*=\s*/, ' &= ');
    return next;
  }

  function convertSpAlign(inner){
    var rows=splitTopLevel(inner, ';').map(formatSyseqRow).filter(Boolean);
    if(rows.length===0) return '';
    return '\\begin{aligned}' + rows.join('\\\\\n') + '\\end{aligned}';
  }

  function replaceDelimitedCommands(tex, commandNames, replacer){
    var result='', index=0;
    while(index<tex.length){
      var command=null;
      for(var i=0;i<commandNames.length;i++){
        if(tex.indexOf('\\' + commandNames[i] + '{', index)===index){
          command=commandNames[i];
          break;
        }
      }

      if(!command){
        result+=tex[index];
        index++;
        continue;
      }

      var openIndex=index+command.length+1;
      var closeIndex=findMatchingBrace(tex, openIndex);
      if(closeIndex<0){
        result+=tex.slice(index);
        break;
      }

      result+=replacer(tex.slice(openIndex+1, closeIndex));
      index=closeIndex+1;
    }
    return result;
  }

  function preprocessLatex(tex){
    tex = tex
      .replace(/\$([^$]*)\$/g, '$1')
      .replace(/\\expandafter\\(syseq|spalignsys)\\expandafter\s*\{/g, '\\$1{')
      .replace(/\\spalignsysdelims\s*(?:\\\{|\(|\[|\.)?(?:\\\}|\)|\]|\.)?/g, '')
      .replace(/\\spalignsystabspace\s*=\s*[^\\\s]+/g, '')
      .replace(/\\hfil[lr]?\b/g, '')
      .replace(/\}%\s*$/gm, '}');

    tex = replaceDelimitedCommands(tex, ['syseq','spalignsys'], convertSpAlign);
    tex = tex.replace(/\\\./g, '{}').replace(/\\\+/g, '+');

    return tex;
  }

  function processNode(root){
    var el=root||document.body, count=0;
    Array.from(el.querySelectorAll('script[type="text/x-latex-inline"]')).forEach(function(s){
      var sp=document.createElement('span');
      sp.textContent='\\\\('+preprocessLatex(s.textContent)+'\\\\)';
      s.parentNode.replaceChild(sp,s); count++;
    });
    Array.from(el.querySelectorAll('script[type="text/x-latex-display"]')).forEach(function(s){
      var dv=document.createElement('div');
      dv.className='pretex-display';
      dv.textContent='\\\\['+preprocessLatex(s.textContent)+'\\\\]';
      s.parentNode.replaceChild(dv,s); count++;
    });
    return count;
  }

  function typesetEl(el){
    if(window.MathJax&&window.MathJax.typesetPromise)
      window.MathJax.typesetPromise([el]).catch(function(){});
  }

  function loadMathJax(then){
    if(mjaxReady){then&&then();return;}
    mjaxReady=true;
    window.MathJax={
      tex:{
        inlineMath:[['\\\\(','\\\\)']],
        displayMath:[['\\\\[','\\\\]']],
        packages:{'[+]':['noerrors','noundefined']},
        macros:{
          R:'\\\\mathbb{R}',C:'\\\\mathbb{C}',N:'\\\\mathbb{N}',Z:'\\\\mathbb{Z}',
          lt:'<',gt:'>',
          Span:'\\\\operatorname{Span}',
          Nul:'\\\\operatorname{Nul}',
          Col:'\\\\operatorname{Col}',
          Row:'\\\\operatorname{Row}',
          rank:'\\\\operatorname{rank}',
          nullity:'\\\\operatorname{nullity}',
          vol:'\\\\operatorname{vol}',
          dist:'\\\\operatorname{dist}',
          sptxt:['\\\\quad\\\\text{ #1 }\\\\quad',1],
          syseq:['#1',1],spalignsys:['#1',1],
          mat:['\\\\begin{pmatrix}#1\\\\end{pmatrix}',1],
          vec:['\\\\begin{pmatrix}#1\\\\end{pmatrix}',1],
          rlap:['',1]
        }
      },
      options:{skipHtmlTags:['script','noscript','style','textarea','pre'],
               ignoreHtmlClass:'tex2jax_ignore'},
      startup:{typeset:false}
    };
    if(!document.getElementById('pretex-mjax-css')){
      var css=document.createElement('style');
      css.id='pretex-mjax-css';
      css.textContent=[
        'mjx-container{max-width:100%;overflow-x:auto;overflow-y:visible;}',
        'mjx-container[display="true"]{display:block!important;clear:both;margin:0.8em auto!important;text-align:center;overflow-x:auto;overflow-y:visible;}',
        'mjx-container[display="true"] svg{vertical-align:baseline!important;}',
        'mjx-container[display="false"]{display:inline-block!important;margin:0 0.1em!important;vertical-align:middle;}',
        'mjx-container svg{max-width:100%;height:auto;}',
        '.pretex-display{display:flow-root!important;margin:1em 0!important;padding:0.15em 0;text-align:center;max-width:100%;overflow-x:auto;overflow-y:visible;clear:both;}',
        '.pretex-display>svg.pretex{display:block!important;max-width:100%;margin:0 auto;}',
        'p mjx-container[display="true"]{display:block!important;margin:0.8em auto!important;}',
        'figure,div.mathbox,.mathbox{max-width:100%;}'
      ].join('\n');
      document.head.appendChild(css);
    }
    var s=document.createElement('script');
    s.async=true;
    s.src='${MATHJAX_ASSET_URL}';
    s.onload=function(){
      window.MathJax.startup.promise.then(function(){
        window.MathJax.typesetPromise().then(function(){ then&&then(); }).catch(function(){ then&&then(); });
      });
    };
    document.head.appendChild(s);
  }

  function setupObserver(){
    if(observing)return; observing=true;
    var obs=new MutationObserver(function(muts){
      muts.forEach(function(m){
        m.addedNodes.forEach(function(node){
          if(node.nodeType!==1)return;
          if(node.querySelector&&node.querySelector('script[type^="text/x-latex"]')){
            var n=processNode(node);
            if(n>0) loadMathJax(function(){typesetEl(node);});
          }
        });
      });
    });
    obs.observe(document.body,{childList:true,subtree:true});
  }

  function fixIoniconsFont(){
    var PUA_MAP = {
      '\ue000':'\u25c4','\ue001':'\u25ba','\ue002':'\u25b2','\ue003':'\u25bc',
      '\ue00c':'\u2630','\ue00d':'\u2715',
      '\ue04d':'\u25c4','\ue04e':'\u25ba',
      '\ue070':'\u2b06','\ue071':'\u2b07',
      '\ue072':'\u25b6','\ue073':'\u25c0',
      '\ue110':'\u2630','\ue114':'\u2713','\ue117':'\u2715',
      '\uf25e':'\u26f6','\uf28e':'\u2715',
      '\uf3d0':'\u25bc','\uf3d2':'\u25b2',
      '\uf10c':'\u25cb','\uf111':'\u25cf',
      '\uf26e':'\u2b24','\uf26c':'\u2296',
      '\uf124':'\u2197','\uf064':'\u2192',
      '\uf147':'\u2212','\uf196':'\u002b'
    };
    var hasPUA = Object.keys(PUA_MAP);
    function fixEl(el){
      if(!el||el.childElementCount>0) return;
      var t=el.textContent;
      if(!t) return;
      var out=t;
      hasPUA.forEach(function(ch){ out=out.split(ch).join(PUA_MAP[ch]); });
      if(out!==t){
        el.textContent=out;
        el.style.fontFamily='system-ui,sans-serif';
        el.style.fontStyle='normal';
      }
    }
    function fixAll(root){
      var candidates=(root||document).querySelectorAll(
        '.nav-button,.previous-button,.next-button,'+
        '.knowl-link,.active-knowl,.detail-knowl,'+
        '.mathbox .maximizer,.mathbox .minimizer,'+
        '[class*="icon"],[class*="btn"],[class*="button"],'+
        'a>span,button>span,nav span'
      );
      candidates.forEach(fixEl);
      var allSpans=(root||document).querySelectorAll('span,a,button,i');
      allSpans.forEach(function(el){
        if(el.childElementCount===0){
          var t=el.textContent;
          if(t&&t.length<=3&&hasPUA.some(function(c){return t.indexOf(c)>=0;})){
            fixEl(el);
          }
        }
      });
    }
    if(document.fonts&&document.fonts.ready){
      document.fonts.ready.then(function(){
        var testChars='\uf25e\ue04d\ue04e';
        var ionOk=document.fonts.check&&document.fonts.check('16px Ionicons',testChars);
        if(!ionOk) fixAll(null);
      });
    } else {
      setTimeout(function(){ fixAll(null); },1200);
    }
  }

  function init(){
    var n=processNode(null);
    if(n>0) loadMathJax(setupObserver);
    else setupObserver();
    if(document.fonts&&document.fonts.ready){
      document.fonts.ready.then(fixIoniconsFont);
    } else {
      setTimeout(fixIoniconsFont,1200);
    }
  }

  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded',init);
  else init();
})();
</script>`;

const mathBoxPreviewFixes = String.raw`
<style id="mathbox-loader-preview-fix">
.mathbox-loader.proofdesk-loader-hidden{
  opacity:0!important;
  visibility:hidden!important;
  pointer-events:none!important;
}
</style>
<script>
(function(){
  'use strict';
  var loaderObserverStarted = false;

  function hasVisibleCanvas(){
    return Array.from(document.querySelectorAll('canvas')).some(function(canvas){
      var style = window.getComputedStyle(canvas);
      return canvas.clientWidth > 80 &&
        canvas.clientHeight > 80 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';
    });
  }

  function hideMathBoxLoaders(){
    var loaders = Array.from(document.querySelectorAll('.mathbox-loader'));
    if(!loaders.length || !hasVisibleCanvas()){
      return false;
    }

    loaders.forEach(function(loader){
      if(loader.dataset.proofdeskHidden === 'true'){
        return;
      }

      loader.dataset.proofdeskHidden = 'true';
      loader.classList.add('proofdesk-loader-hidden', 'mathbox-exit');
      window.setTimeout(function(){
        loader.style.display = 'none';
      }, 180);
    });

    return true;
  }

  function monitorMathBoxLoaders(){
    if(loaderObserverStarted){
      return;
    }

    loaderObserverStarted = true;
    var deadline = Date.now() + 10000;

    function tick(){
      hideMathBoxLoaders();
      if(Date.now() < deadline){
        window.requestAnimationFrame(tick);
      }
    }

    window.requestAnimationFrame(tick);
    window.setTimeout(hideMathBoxLoaders, 250);
    window.setTimeout(hideMathBoxLoaders, 1000);
    window.setTimeout(hideMathBoxLoaders, 2500);

    var observer = new MutationObserver(function(){
      hideMathBoxLoaders();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', monitorMathBoxLoaders, { once: true });
  } else {
    monitorMathBoxLoaders();
  }
})();
</script>`;

const PROOFDESK_LAYOUT_STYLE_PATTERN = /\s*<style\b[^>]*\bid=["']proofdesk-pretex-layout-fix["'][^>]*>[\s\S]*?<\/style>/gi;
const PROOFDESK_LAYOUT_SCRIPT_PATTERN = /\s*<script\b[^>]*\bid=["']proofdesk-pretex-layout-guard["'][^>]*>[\s\S]*?<\/script>/gi;

const removeExistingPreTeXtLayoutFix = (html) =>
  html
    .replace(PROOFDESK_LAYOUT_STYLE_PATTERN, '')
    .replace(PROOFDESK_LAYOUT_SCRIPT_PATTERN, '');

const injectLatestPreTeXtLayoutFix = (html) => {
  const cleaned = removeExistingPreTeXtLayoutFix(html);

  if (cleaned.includes('</head>')) {
    return cleaned.replace('</head>', `${PROOFDESK_PRETEX_LAYOUT_FIX}\n</head>`);
  }

  return `${PROOFDESK_PRETEX_LAYOUT_FIX}\n${cleaned}`;
};

const buildPreviewHtml = (raw, sessionBase, { isKnowlFile }) => {
  const ilaAddOnRef = raw.includes('ila-add-on.css')
    ? ''
    : `<link rel="stylesheet" href="${sessionBase}css/ila-add-on.css" type="text/css">`;

  const structuralCss = `${ilaAddOnRef}
<style id="pretex-preview-structure-fix">
.mathbook-content .preface .definition-like > .heading .title,
.mathbook-content .preface .theorem-like > .heading .title,
.mathbook-content .preface .remark-like > .heading .title,
.mathbook-content .preface .example-like > .heading .title,
.mathbook-content .preface .exercise-like > .heading .title,
.mathbook-content .preface .aside-like > .heading .title,
.mathbook-content .preface .definition-like > header > .heading .title,
.mathbook-content .preface .theorem-like > header > .heading .title,
.mathbook-content .preface .remark-like > header > .heading .title,
.mathbook-content .preface .example-like > header > .heading .title,
.mathbook-content .preface .exercise-like > header > .heading .title,
.mathbook-content .preface .aside-like > header > .heading .title{
  margin:0!important;
  font-size:inherit!important;
  font-weight:inherit!important;
  color:inherit!important;
}

.mathbook-content .knowl-output .knowl-footer{
  display:none!important;
}

.mathbook-content .knowl-output .incontext{
  margin-bottom:0!important;
}
</style>`;

  let rewritten = rewriteAbsolutePreviewUrls(raw, sessionBase);

  if (isKnowlFile) {
    rewritten = rewriteBareRelativeAttributes(rewritten, sessionBase);
    rewritten = rewriteCssUrls(rewritten, sessionBase, PREVIEW_SHARED_ROOT_DIRS);
  }

  const html = rewritten
    .replace(/<head([^>]*)>/i, `<head$1>\n${structuralCss}`)
    .replace('</head>', `${mathBoxPreviewFixes}\n</head>`)
    .replace('</body>', `${pretexFallback}\n</body>`);

  return injectLatestPreTeXtLayoutFix(html);
};

const buildPreviewCss = (rawCss, sessionBase, { isSiteCssFile }) => {
  let rewrittenCss = rewriteAbsolutePreviewUrls(rawCss, sessionBase);

  if (isSiteCssFile) {
    rewrittenCss = rewriteCssUrls(rewrittenCss, sessionBase, PREVIEW_SHARED_ROOT_DIRS);
  }

  return rewrittenCss;
};

const transformPreviewFile = (relativePath, rawContent, sessionId) => {
  const ext = relativePath.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
  const sessionBase = `/preview/${sessionId}/`;

  if (ext === '.html') {
    return buildPreviewHtml(rawContent, sessionBase, {
      isKnowlFile: relativePath.startsWith('knowl/'),
    });
  }

  if (ext === '.css') {
    return buildPreviewCss(rawContent, sessionBase, {
      isSiteCssFile: relativePath.startsWith('css/'),
    });
  }

  return rawContent;
};

export {
  PREVIEW_SHARED_ROOT_DIRS,
  PROOFDESK_PRETEX_LAYOUT_FIX,
  PROOFDESK_PRETEX_LAYOUT_FIX_VERSION,
  injectLatestPreTeXtLayoutFix,
  transformPreviewFile,
};
