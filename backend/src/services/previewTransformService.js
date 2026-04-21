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
        '.pretex-display>svg.pretex{display:block!important;max-width:100%;height:auto;margin:0 auto;}',
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

const buildPreviewHtml = (raw, sessionBase, { isKnowlFile }) => {
  const ilaAddOnRef = raw.includes('ila-add-on.css')
    ? ''
    : `<link rel="stylesheet" href="${sessionBase}css/ila-add-on.css" type="text/css">`;

  const mathLayoutCss = `${ilaAddOnRef}
<style id="pretex-layout-fix">
mjx-container{max-width:100%;overflow-x:auto;overflow-y:visible;}
mjx-container[display="true"]{display:block!important;clear:both;margin:0.8em auto!important;text-align:center;overflow-x:auto;overflow-y:visible;}
mjx-container[display="true"] svg{vertical-align:baseline!important;}
mjx-container[display="false"]{display:inline-block!important;margin:0 0.1em!important;vertical-align:middle;}
mjx-container svg{max-width:100%;height:auto;}
.pretex-display{display:flow-root!important;clear:both;position:relative;max-width:100%;margin:1em 0!important;padding:0.15em 0;text-align:center;overflow-x:auto;overflow-y:visible;}
.pretex-display > svg.pretex{display:block!important;max-width:100%;height:auto;margin:0 auto;}
.mathbook-content li > .pretex-display{margin:0.75em 0!important;}
p>mjx-container{vertical-align:middle;}
figure,div.mathbox,.mathbox{max-width:100%;}
.mathbook-content .mathbox iframe{display:block;width:100%;height:100%;}

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

  return rewritten
    .replace(/<head([^>]*)>/i, `<head$1>\n${mathLayoutCss}`)
    .replace('</head>', `${mathBoxPreviewFixes}\n</head>`)
    .replace('</body>', `${pretexFallback}\n</body>`);
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
  transformPreviewFile,
};
