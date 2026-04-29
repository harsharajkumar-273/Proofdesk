#!/bin/bash
# ILA / PreTeXt Docker Build Script - Full Version with Math Rendering

# CRITICAL: Ensure files are copied to output even if script exits unexpectedly
cleanup_and_copy() {
    echo ""
    echo "=== Final copy to /output ==="
    
    if [ -e /output ] && [ ! -d /output ]; then
        echo "  WARNING: /output exists as a file, removing..."
        rm -f /output
    fi
    
    mkdir -p /output 2>/dev/null || true
    
    echo "Finding all HTML files in system..."
    find /home -name "*.html" -type f 2>/dev/null | head -20
    find /repo -name "*.html" -type f 2>/dev/null | grep -v node_modules | head -20
    
    echo "Copying from all known locations..."
    [ -d "/home/vagrant/build" ] && cp -r /home/vagrant/build/* /output/ 2>/dev/null && echo "  Copied /home/vagrant/build"
    [ -d "/home/vagrant/cache" ] && cp -r /home/vagrant/cache/* /output/ 2>/dev/null && echo "  Copied /home/vagrant/cache"
    [ -d "/home/vagrant/output-html" ] && cp -r /home/vagrant/output-html/* /output/ 2>/dev/null && echo "  Copied /home/vagrant/output-html"
    [ -d "/repo/html" ] && cp -r /repo/html/* /output/ 2>/dev/null && echo "  Copied /repo/html"
    
    for dir in $(find /home /repo -type d -name "html" 2>/dev/null | grep -v node_modules); do
        echo "  Found html dir: $dir"
        cp -r "$dir"/* /output/ 2>/dev/null || true
    done
    
    find /home/vagrant -maxdepth 2 -name "*.html" -exec cp {} /output/ \; 2>/dev/null || true
    
    echo "Fixing file extensions..."
    fix_extensions
    
    HTML_COUNT=$(find /output -name "*.html" -type f 2>/dev/null | wc -l)
    echo ""
    echo "=== FILES IN /output: $HTML_COUNT HTML files ==="
    find /output -name "*.html" -type f 2>/dev/null | head -30
}

fix_extensions() {
    # Fix CSS files - copy extensionless files to .css versions if larger
    if [ -d "/output/css" ]; then
        for f in /output/css/*; do
            if [ -f "$f" ] && [[ ! "$f" =~ \.(css|woff|woff2|otf|ttf|eot|svg)$ ]]; then
                base=$(basename "$f")
                size_f=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)
                size_css=$(stat -c%s "$f.css" 2>/dev/null || stat -f%z "$f.css" 2>/dev/null || echo 0)
                if [ "$size_f" -gt "$size_css" ]; then
                    cp "$f" "$f.css" 2>/dev/null && echo "  Fixed: $base -> $base.css"
                fi
            fi
        done
    fi
    
    # Fix JS files
    if [ -d "/output/js" ]; then
        for f in /output/js/*; do
            if [ -f "$f" ] && [[ ! "$f" =~ \.js$ ]]; then
                base=$(basename "$f")
                size_f=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo 0)
                size_js=$(stat -c%s "$f.js" 2>/dev/null || stat -f%z "$f.js" 2>/dev/null || echo 0)
                if [ "$size_f" -gt "$size_js" ]; then
                    cp "$f" "$f.js" 2>/dev/null && echo "  Fixed: $base -> $base.js"
                fi
            fi
        done
    fi
    
    # Ensure js/cover.js exists (cover.html requests it; created by scons but may be skipped on error)
    mkdir -p /output/js 2>/dev/null
    [ ! -f "/output/js/cover.js" ] && echo "// cover.js placeholder" > /output/js/cover.js

    # Copy logo to images directory
    mkdir -p /output/images 2>/dev/null
    if [ ! -f "/output/images/logo.gif" ]; then
        [ -f "/output/theme-gt/logo.gif" ] && cp /output/theme-gt/logo.gif /output/images/logo.gif
        [ -f "/output/static/theme-gt/logo.gif" ] && cp /output/static/theme-gt/logo.gif /output/images/logo.gif
    fi
    # Normalize demo asset names expected by older links.
    if [ -d "/output/demos" ]; then
        mkdir -p /output/demos/css /output/demos/js 2>/dev/null || true

        [ -f "/output/demos/css/rabbit" ] && [ ! -f "/output/demos/css/rabbits" ] && cp "/output/demos/css/rabbit" "/output/demos/css/rabbits"
        [ -f "/output/demos/css/rabbits" ] && [ ! -f "/output/demos/css/rabbits.css" ] && cp "/output/demos/css/rabbits" "/output/demos/css/rabbits.css"
        [ -f "/output/demos/css/rabbit" ] && [ ! -f "/output/demos/css/rabbit.css" ] && cp "/output/demos/css/rabbit" "/output/demos/css/rabbit.css"

        if [ ! -f "/output/demos/js/rabbits.js" ]; then
            if [ -f "/repo/vendor/jquery.min.js" ] && [ -f "/output/demos/vendor/bootstrap.js" ] && [ -f "/output/demos/vendor/plotly.js" ]; then
                cat /repo/vendor/jquery.min.js /output/demos/vendor/bootstrap.js /output/demos/vendor/plotly.js > /output/demos/js/rabbits.js 2>/dev/null || true
            elif [ -f "/output/demos/js/demo2.js" ]; then
                cp /output/demos/js/demo2.js /output/demos/js/rabbits.js 2>/dev/null || true
            fi
        fi

        [ -f "/output/demos/bestfit.html" ] && [ ! -f "/output/demos/bestfit-implicit.html" ] && cp "/output/demos/bestfit.html" "/output/demos/bestfit-implicit.html"
    fi
}

# Set trap to run cleanup on ANY exit
trap cleanup_and_copy EXIT

# Ensure /output is a directory
if [ -e /output ] && [ ! -d /output ]; then
    rm -f /output
fi
mkdir -p /output 2>/dev/null || true

echo "=== ILA / PreTeXt Build Started ==="
echo "Working directory: $(pwd)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Python version: $(python3 --version)"
echo "LaTeX version: $(pdflatex --version | head -1)"
echo ""
echo "Contents of /repo:"
ls -la /repo 2>/dev/null || echo "(empty)"

cd /repo

if [ ! -d "/repo" ] || [ -z "$(ls -A /repo 2>/dev/null)" ]; then
    echo "❌ ERROR: No repository found in /repo"
    exit 1
fi

echo ""
echo "=== Step 1: Initializing submodules ==="
# Only init submodules if they haven't been populated yet
if [ ! -f "mathbook/xsl/mathbook-html.xsl" ] || [ ! -d "mathbox/src" ] || [ ! -f "mathbook-assets/SConstruct" ]; then
    git submodule update --init --recursive 2>/dev/null || echo "⚠️  Git submodules skipped"
else
    echo "  ✓ Submodules already initialized, skipping"
fi

echo ""
echo "=== Step 2: Fixing Ruby 3.2 Compass Compatibility ==="
# Patch compass gem for Ruby 3.2 (File.exists? -> File.exist?)
echo "Patching compass for Ruby 3.2 compatibility..."
COMPASS_HELPERS=$(find /var/lib/gems -name "helpers.rb" -path "*/compass*/configuration/*" 2>/dev/null | head -1)
if [ -n "$COMPASS_HELPERS" ] && [ -f "$COMPASS_HELPERS" ]; then
    echo "  Found: $COMPASS_HELPERS"
    sed -i 's/File\.exists?/File.exist?/g' "$COMPASS_HELPERS" 2>/dev/null && echo "  ✓ Patched File.exists? -> File.exist?"
fi

# Also patch any other compass files that might have the issue
for f in $(find /var/lib/gems -name "*.rb" -path "*/compass*" 2>/dev/null); do
    if grep -q "File\.exists?" "$f" 2>/dev/null; then
        sed -i 's/File\.exists?/File.exist?/g' "$f" 2>/dev/null
        echo "  ✓ Patched: $f"
    fi
done

echo ""
echo "=== Step 3: Building submodule dependencies ==="

# Build mathbook-assets (CSS)
if [ -d "mathbook-assets" ]; then
    echo "Found mathbook-assets submodule..."
    cd mathbook-assets

    mkdir -p build

    # Skip rebuild if CSS already exists and is valid
    _CSS_SIZE=$(stat -c%s "build/mathbook-gt.css" 2>/dev/null || stat -f%z "build/mathbook-gt.css" 2>/dev/null || echo 0)
    if [ "$_CSS_SIZE" -gt 1000 ]; then
        echo "  ✓ mathbook-assets CSS already built ($_CSS_SIZE bytes), skipping"
        cp build/mathbook-gt.css build/mathbook-gt 2>/dev/null || true
        cd /repo
    else

    # Try scons first (with patched compass)
    if [ -f "SConstruct" ]; then
        echo "  Building mathbook-assets with scons..."
        if scons -j$(nproc) 2>&1; then
            echo "  ✓ mathbook-assets scons build succeeded"
        else
            echo "  ⚠️  scons failed, trying compass directly..."
        fi
    fi
    
    # Check if CSS was built
    if [ -f "build/mathbook-gt.css" ] && [ $(stat -c%s "build/mathbook-gt.css" 2>/dev/null || stat -f%z "build/mathbook-gt.css" 2>/dev/null || echo 0) -gt 1000 ]; then
        echo "  ✓ mathbook-assets CSS built successfully ($(stat -c%s build/mathbook-gt.css 2>/dev/null || stat -f%z build/mathbook-gt.css) bytes)"
        cp build/mathbook-gt.css build/mathbook-gt 2>/dev/null
    elif [ -f "build/mathbook-gt" ] && [ $(stat -c%s "build/mathbook-gt" 2>/dev/null || stat -f%z "build/mathbook-gt" 2>/dev/null || echo 0) -gt 1000 ]; then
        echo "  ✓ mathbook-assets CSS found ($(stat -c%s build/mathbook-gt 2>/dev/null || stat -f%z build/mathbook-gt) bytes)"
        cp build/mathbook-gt build/mathbook-gt.css 2>/dev/null
    else
        echo "  ⚠️  Trying compass compile directly..."
        if [ -f "stylesheets/mathbook-gt.scss" ]; then
            compass compile --css-dir=build --sass-dir=stylesheets --force 2>&1 || true
        fi
        
        # Check again
        if [ -f "build/mathbook-gt.css" ] && [ $(stat -c%s "build/mathbook-gt.css" 2>/dev/null || echo 0) -gt 1000 ]; then
            echo "  ✓ Compass compile succeeded"
            cp build/mathbook-gt.css build/mathbook-gt 2>/dev/null
        else
            # Try using sass directly (dart-sass/sass-embedded)
            echo "  ⚠️  Trying sass-embedded directly..."
            if command -v sass &> /dev/null; then
                sass stylesheets/mathbook-gt.scss build/mathbook-gt.css 2>&1 || true
                if [ -f "build/mathbook-gt.css" ] && [ $(stat -c%s "build/mathbook-gt.css" 2>/dev/null || echo 0) -gt 1000 ]; then
                    echo "  ✓ sass-embedded compile succeeded"
                    cp build/mathbook-gt.css build/mathbook-gt 2>/dev/null
                fi
            fi
        fi
        
        # Final fallback - create comprehensive CSS using actual mathbook-content.css
        if [ ! -f "build/mathbook-gt.css" ] || [ $(stat -c%s "build/mathbook-gt.css" 2>/dev/null || echo 0) -lt 1000 ]; then
            echo "  ⚠️  Creating comprehensive fallback CSS from mathbook-content.css..."
            # GT UI CSS (replaces compiled SCSS output)
            cat > build/mathbook-gt.css << 'FALLBACK_UI_CSS'
/* ILA GT Theme UI CSS - fallback when SCSS compilation fails */
*,*::before,*::after{box-sizing:border-box}
html{line-height:1.15;-webkit-text-size-adjust:100%}
body{margin:0;font-family:"CharterBT","PT Serif","Times New Roman",Times,serif;font-size:18px;line-height:1.5;color:#333;background:#545454;}
a{color:#000;text-decoration:none}
a:hover{color:#111}
#masthead{background:#262626;padding:0;border-right:none;border-left:none;}
#masthead .banner{background:#262626;}
#masthead .banner .container{max-width:739px;margin:0 auto;padding:0 10px;display:flex;align-items:center;min-height:70px;position:relative;}
#masthead .title-container{flex:1;padding:10px 0;}
#masthead h1.heading{margin:0;padding:0;border:none;font-size:1.8em;line-height:1.2;}
#masthead h1.heading a{color:#fff;text-decoration:none;}
#masthead h1.heading a:hover{color:#eeb211;}
#masthead .byline{color:#eeb211;margin:0;margin-top:-0.4em;font-size:0.9em;}
#masthead #logo-link{display:inline-block;margin-right:10px;}
#masthead #logo-link img{height:60px;}
#masthead.smallbuttons{max-width:739px;margin:0 auto;border-right:none;border-left:none;}
.pdf-version{position:absolute;right:3px;bottom:-1em;}
.pdf-version a{font-family:"CharterBT";text-decoration:none;color:#eeb211;font-size:0.8em;}
#gt-navbar,.navbar{background:#eeeeee;padding:0;border-bottom:1px solid #ccc;position:relative;max-width:739px;margin:0 auto;}
.navbar .dropdown{background:#262626;max-width:739px;margin:0 auto;}
#toc{pointer-events:initial;}
#toc .toc-contents{background:#262626;padding:15px;color:#fff;max-height:0;overflow:hidden;transition:max-height 0.3s ease;}
.toc-open #toc .toc-contents{max-height:2000px;}
#toc h2{font-size:0.9em;font-weight:bold;margin:0.5em 0 0.2em;padding:0;border:none;color:#fff;}
#toc h2 a{color:#fff;text-decoration:none;}
#toc h2 a:hover,#toc h2.active a{color:#eeb211;}
#toc h2.active{background:#9a7500;}
#toc h2+h2{margin-top:0;}
#toc ul{list-style:none;margin:0 0 0.5em 0.5em;padding:0;}
#toc li a{color:#ccc;text-decoration:none;font-size:0.85em;display:block;padding:2px 0;}
#toc li a:hover,#toc li a.active{color:#eeb211;}
.navbar-top-buttons{background:#545454;padding:6px 10px;display:flex;align-items:center;flex-wrap:wrap;}
.toolbar-buttons-left{display:flex;align-items:center;flex-wrap:wrap;flex:1;}
.toolbar-buttons-right{display:flex;align-items:center;gap:5px;}
.toolbar-item{display:flex;align-items:center;margin-right:8px;}
.toolbar-item a.button,a.previous-button,a.next-button,a.up-button{display:inline-block;padding:4px 10px;background:#262626;color:#fff;text-decoration:none;font-size:0.8em;border-radius:3px;margin:0 2px;}
.toolbar-item a.button:hover,a.previous-button:hover,a.next-button:hover,a.up-button:hover{background:#eeb211;color:#000;}
.toggle-button{display:inline-block;padding:4px 10px;color:#fff;font-size:1.3em;cursor:pointer;}
.toggle-button::before{content:'\2630';}
.mininav{float:none;padding-top:0;overflow:hidden;display:table-cell;vertical-align:middle;color:#ccc;font-size:0.8em;padding-right:5px;}
.indexnav{float:none;display:table-cell;overflow:hidden;margin-top:0;padding-left:0.5em;height:90%;vertical-align:middle;}
.indexnav a{color:#fff;text-decoration:none;font-size:0.85em;display:inline-block;width:2.6ex;text-align:center;}
.indexnav a:hover{color:#eeb211;}
.page{display:flex;max-width:739px;margin:0 auto;background:#fff;min-height:80vh;}
.page main,.page .main{flex:1;overflow:hidden;}
#sidebar-left{width:200px;flex-shrink:0;background:#f5f5f5;border-right:1px solid #ddd;overflow-y:auto;}
#content,.mathbook-content{max-width:600px;margin:0 auto;padding:25px 40px;background:#fff;font-size:18px;line-height:1.5;}
main.main>#content{max-width:none;}
a.assistive{padding:6px;position:absolute;top:-40px;left:0;color:#fff;border-right:1px solid #fff;border-bottom:1px solid #fff;border-bottom-right-radius:8px;background:#000;-webkit-transition:top 1s ease-out;transition:top 1s ease-out;z-index:100;}
a.assistive:focus{position:static;top:auto;}
footer.footer{background:#262626;color:#ccc;padding:20px;font-size:0.85em;text-align:center;}
FALLBACK_UI_CSS

            # Append the real mathbook-content.css for proper semantic styling
            if [ -f "/repo/mathbook/css/mathbook-content.css" ]; then
                echo "" >> build/mathbook-gt.css
                cat /repo/mathbook/css/mathbook-content.css >> build/mathbook-gt.css
                echo "  ✓ Appended mathbook-content.css to fallback"
            fi

            cp build/mathbook-gt.css build/mathbook-gt
            echo "  Created fallback CSS ($(stat -c%s build/mathbook-gt.css 2>/dev/null || stat -f%z build/mathbook-gt.css) bytes)"
        fi
    fi
    
    echo "  mathbook-assets/build contents:"
    ls -la build/ 2>/dev/null | head -10

    cd /repo
    fi  # end else (CSS not already built)
fi

# Build mathbox
if [ -d "mathbox" ]; then
    echo "Found mathbox submodule..."
    cd mathbox
    
    mkdir -p /repo/mathbox/build
    
    # Check for pre-built mathbox files first (submodule may already have build/)
    MATHBOX_PREBUILT=""
    for candidate in \
        "/repo/mathbox/build/mathbox-bundle.js" \
        "/repo/mathbox/build/mathbox.js" \
        "/repo/mathbox/build/MathBox.js" \
        "/repo/mathbox/dist/mathbox-bundle.js" \
        "/repo/mathbox/dist/mathbox.js"; do
        if [ -f "$candidate" ] && [ "$(stat -c%s "$candidate" 2>/dev/null || stat -f%z "$candidate" 2>/dev/null || echo 0)" -gt 10000 ]; then
            echo "  ✓ Found pre-built mathbox: $candidate"
            MATHBOX_PREBUILT="$candidate"
            break
        fi
    done

    if [ -n "$MATHBOX_PREBUILT" ]; then
        mkdir -p /repo/mathbox/build
        [ "$MATHBOX_PREBUILT" != "/repo/mathbox/build/mathbox-bundle.js" ] && \
            cp "$MATHBOX_PREBUILT" /repo/mathbox/build/mathbox-bundle.js 2>/dev/null || true
        echo "  ✓ Using pre-built mathbox"
    elif [ -f "package.json" ]; then
        echo "  Installing mathbox dependencies..."
        npm install 2>&1 || echo "  ⚠️  npm install had issues"

        echo "  Building mathbox with gulp..."
        if gulp build 2>&1; then
            echo "  ✓ mathbox gulp build succeeded"
        else
            echo "  ⚠️  gulp build failed, trying npm run build..."
            npm run build 2>&1 || echo "  ⚠️  npm run build also failed"
            # Fallback: manually compile CoffeeScript then browserify
            if [ ! -f "/repo/mathbox/build/mathbox-bundle.js" ] || \
               [ $(stat -c%s "/repo/mathbox/build/mathbox-bundle.js" 2>/dev/null || echo 0) -lt 1000 ]; then
                echo "  Trying manual CoffeeScript + browserify build..."
                mkdir -p /tmp/mathbox-js
                # Compile entire src/ tree from CoffeeScript to JS maintaining structure
                if [ -d "src" ]; then
                    coffee -c -o /tmp/mathbox-js src/ 2>/dev/null || true
                fi
                # Get entry point from package.json if available
                PKG_MAIN=$(node -e "try{var p=JSON.parse(require('fs').readFileSync('package.json','utf8'));var m=p.main||'';console.log(m.replace(/^src\//,'').replace(/\.coffee$/,'.js'));}catch(e){console.log('');}" 2>/dev/null || echo "")
                # Try multiple candidate entry points
                BUNDLE_DONE=false
                for entry_js in \
                    "${PKG_MAIN:+/tmp/mathbox-js/$PKG_MAIN}" \
                    /tmp/mathbox-js/index.js \
                    /tmp/mathbox-js/mathbox.js \
                    /tmp/mathbox-js/main.js \
                    $(find /tmp/mathbox-js -maxdepth 2 -name "index.js" 2>/dev/null | head -3); do
                    [ -z "$entry_js" ] && continue
                    if [ -f "$entry_js" ]; then
                        mkdir -p /repo/mathbox/build
                        browserify "$entry_js" --standalone MathBox \
                            -o /repo/mathbox/build/mathbox-bundle.js 2>/dev/null \
                            && echo "  ✓ Manual mathbox build succeeded from $entry_js" \
                            && BUNDLE_DONE=true && break
                    fi
                done
            fi
        fi
    fi

    if [ -f "/repo/mathbox/build/mathbox-bundle.js" ]; then
        echo "  ✓ mathbox-bundle.js exists"
        cp /repo/mathbox/build/mathbox-bundle.js /repo/mathbox/build/mathbox-bundle 2>/dev/null || true
        cp /repo/mathbox/build/mathbox-bundle.js /repo/mathbox/build/mathbox 2>/dev/null || true
        cp /repo/mathbox/build/mathbox-bundle.js /repo/mathbox/build/mathbox.js 2>/dev/null || true
    else
        echo "  ⚠️  Creating mathbox placeholder..."
        cat > /repo/mathbox/build/mathbox-bundle.js << 'MATHBOX_PLACEHOLDER'
// MathBox placeholder
(function(global) {
    var MathBox = {
        version: 'placeholder',
        mathBox: function(opts) {
            console.log('MathBox placeholder - interactive demos unavailable');
            return { select: function() { return this; }, set: function() { return this; }, add: function() { return this; } };
        }
    };
    global.MathBox = MathBox;
    global.mathBox = MathBox.mathBox;
})(window);
MATHBOX_PLACEHOLDER
        cp /repo/mathbox/build/mathbox-bundle.js /repo/mathbox/build/mathbox-bundle
        cp /repo/mathbox/build/mathbox-bundle.js /repo/mathbox/build/mathbox
        cp /repo/mathbox/build/mathbox-bundle.js /repo/mathbox/build/mathbox.js
    fi
    
    [ ! -f "/repo/mathbox/build/mathbox.css" ] && echo "/* MathBox CSS */" > /repo/mathbox/build/mathbox.css
    
    cd /repo
fi

# Create demos vendor dependencies
if [ -d "demos" ]; then
    echo "Found demos directory..."
    mkdir -p demos/vendor demos/css
    
    [ ! -f "demos/vendor/domready" ] && cat > demos/vendor/domready << 'DOMREADY_CODE'
(function(global) {
    var fns = [], loaded = false;
    document.addEventListener("DOMContentLoaded", function() { loaded = true; while(fns.length) fns.shift()(); });
    function domready(fn) { loaded ? setTimeout(fn, 0) : fns.push(fn); }
    global.DomReady = { ready: domready };
    global.domready = domready;
})(window);
DOMREADY_CODE

    # screenfull is required by the demo JS build target
    SCREENFULL_JS='var screenfull=(function(){var fn=function(){return false;};return{request:fn,exit:fn,toggle:fn,onchange:fn,onerror:fn,isFullscreen:false,element:null,enabled:false};})();'
    [ ! -f "demos/vendor/screenfull" ] && echo "$SCREENFULL_JS" > demos/vendor/screenfull
    [ ! -f "demos/vendor/screenfull.js" ] && echo "$SCREENFULL_JS" > demos/vendor/screenfull.js

    [ ! -f "demos/vendor/katex" ] && echo "/* KaTeX placeholder */" > demos/vendor/katex
    [ ! -f "demos/vendor/katex.js" ] && echo "/* KaTeX placeholder */" > demos/vendor/katex.js

    # roots.js placeholder (numerical root-finding, used by ILA demos)
    ROOTS_JS='(function(global){function findRoot(f,a,b,tol){tol=tol||1e-6;for(var i=0;i<100;i++){var m=(a+b)/2;if(Math.abs(b-a)<tol)return m;if(f(a)*f(m)<0)b=m;else a=m;}return(a+b)/2;}global.findRoot=findRoot;})(window);'
    [ ! -f "demos/vendor/roots" ] && echo "$ROOTS_JS" > demos/vendor/roots
    [ ! -f "demos/vendor/roots.js" ] && echo "$ROOTS_JS" > demos/vendor/roots.js

    # SCons references vendor files without .js extension; create extensionless copies
    # of any vendor .js files that are missing their extensionless counterpart.
    for jsfile in demos/vendor/*.js; do
        base="${jsfile%.js}"
        [ ! -f "$base" ] && cp "$jsfile" "$base" && echo "  Created extensionless: $base"
    done

    # SCons references demos/css files WITHOUT .css extension (e.g. css/rrmat, css/slideshow).
    # Copy real .css files to extensionless versions first; fall back to empty placeholders.
    for cssfile in demos/css/*.css; do
        [ -f "$cssfile" ] || continue
        base="${cssfile%.css}"
        [ ! -f "$base" ] && cp "$cssfile" "$base" && echo "  Created extensionless: $base"
    done
    for demo in cover demo dynamics eigenvectors kernel least-squares orthogonal projections rabbit spans svd rrmat rrinter slideshow; do
        [ ! -f "demos/css/$demo" ] && echo "/* Placeholder CSS for $demo */" > "demos/css/$demo"
    done
    echo "  ✓ demos dependencies created"
fi

# Install root dependencies
[ -f "bower.json" ] && bower install --allow-root 2>&1 || true
[ -f "package.json" ] && npm install 2>&1 || true

echo ""
echo "=== Step 4: Patching for Python 3 compatibility ==="

if [ -f "site_scons/site_init.py" ]; then
    echo "Found site_scons/site_init.py - creating Python 3 compatible version..."
    
    cp site_scons/site_init.py site_scons/site_init.py.bak
    
    cat > site_scons/site_init.py << 'PYTHON3_SITE_INIT'
import subprocess
import os
from SCons.Builder import Builder
from SCons.Action import Action

def cat_files(target, source, env):
    with open(str(target[0]), 'w', encoding='utf-8') as out:
        for s in source:
            with open(str(s), 'r', encoding='utf-8') as f:
                out.write(f.read())
    return 0

def cat_js(target, source, env):
    with open(str(target[0]), 'w', encoding='utf-8') as out:
        for s in source:
            with open(str(s), 'r', encoding='utf-8') as f:
                out.write(f.read())
            out.write(';\n')
    return 0

def cat_css(target, source, env):
    with open(str(target[0]), 'w', encoding='utf-8') as out:
        for s in source:
            with open(str(s), 'r', encoding='utf-8') as f:
                out.write(f.read())
            out.write('\n')
    return 0

def minify(target, source, env):
    source_path = str(source[0])
    target_path = str(target[0])
    try:
        result = subprocess.run(['uglifyjs', source_path, '-o', target_path, '-c', '-m'],
                                capture_output=True, timeout=60)
        if result.returncode == 0:
            return 0
    except:
        pass
    with open(source_path, 'r', encoding='utf-8') as src:
        with open(target_path, 'w', encoding='utf-8') as dst:
            dst.write(src.read())
    return 0

def minify_css(target, source, env):
    source_path = str(source[0])
    target_path = str(target[0])
    try:
        result = subprocess.run(['cleancss', '-o', target_path, source_path],
                                capture_output=True, timeout=60)
        if result.returncode == 0:
            return 0
    except:
        pass
    with open(source_path, 'r', encoding='utf-8') as src:
        with open(target_path, 'w', encoding='utf-8') as dst:
            dst.write(src.read())
    return 0

def copy_file(target, source, env):
    import shutil
    shutil.copy2(str(source[0]), str(target[0]))
    return 0

def TOOL_ADD_CAT(env):
    env.Append(BUILDERS={
        'CatJS': Builder(action=Action(cat_js, "Concatenating JS: $TARGET"), suffix='.js'),
        'CatCSS': Builder(action=Action(cat_css, "Concatenating CSS: $TARGET"), suffix='.css'),
        'Cat': Builder(action=Action(cat_files, "Concatenating: $TARGET")),
        'Minify': Builder(action=Action(minify, "Minifying JS: $TARGET"), suffix='.js'),
        'MinifyCSS': Builder(action=Action(minify_css, "Minifying CSS: $TARGET"), suffix='.css'),
        'CopyFile': Builder(action=Action(copy_file, "Copying: $TARGET")),
    })

def exists(env):
    return True

def generate(env):
    TOOL_ADD_CAT(env)
PYTHON3_SITE_INIT

    echo "    ✓ Created Python 3 compatible site_init.py"
fi

# Patch pretex for Python 3
if [ -d "pretex" ]; then
    echo "Patching pretex for Python 3..."

    for pyfile in pretex/*.py; do
        if [ -f "$pyfile" ]; then
            cp "$pyfile" "$pyfile.bak"
            sed -i 's/print \([^(].*\)$/print(\1)/g' "$pyfile" 2>/dev/null || true
            sed -i 's/except \([A-Za-z]*\), \([a-z]*\):/except \1 as \2:/g' "$pyfile" 2>/dev/null || true
            # Fix python2 calls to python3
            sed -i "s/'python2'/'python3'/g" "$pyfile" 2>/dev/null || true
            sed -i 's/"python2"/"python3"/g' "$pyfile" 2>/dev/null || true
            # Fix Python 2 unichr() -> chr() (Python 3 rename)
            sed -i 's/unichr(/chr(/g' "$pyfile" 2>/dev/null || true
        fi
    done

    # Patch tounicode.py to gracefully skip if poppler or pdfrw is unavailable
    # OR if the poppler Python bindings have a different API (e.g. python-poppler 0.4.x
    # renamed document_new_from_file -> load_from_file).  We catch both ImportError and
    # AttributeError so the pretex pipeline continues to the inkscape SVG step.
    if [ -f "pretex/tounicode.py" ]; then
        python3 - << 'PATCH_TOUNICODE'
import sys
with open('pretex/tounicode.py', 'r') as f:
    src = f.read()

# Only patch if not already guarded
if '_TOUNICODE_GUARDED' not in src:
    guard = (
        "# _TOUNICODE_GUARDED\n"
        "import sys as _sys\n"
        "try:\n"
        "    import pdfrw  # noqa: F401\n"
        "    import poppler  # noqa: F401\n"
        "    # python-poppler 0.4.x renamed document_new_from_file and uses a different\n"
        "    # argument signature.  We cannot alias it safely, so we exit gracefully.\n"
        "    if not hasattr(poppler, 'document_new_from_file'):\n"
        "        raise AttributeError('python-poppler API incompatible (no document_new_from_file); unicode embedding skipped')\n"
        "except (ImportError, AttributeError) as _e:\n"
        "    print('Warning: ' + str(_e) + '; unicode codepoint embedding skipped.', file=_sys.stderr)\n"
        "    _sys.exit(0)\n\n"
    )
    with open('pretex/tounicode.py', 'w') as f:
        f.write(guard + src)
    print("  \u2713 tounicode.py patched to handle missing/incompatible poppler gracefully")
PATCH_TOUNICODE
    fi

    echo "  ✓ pretex patched for Python 3"

    # Patch processtex.py: replace inkscape_script() with an Inkscape 1.x CLI exporter
    if [ -f "pretex/processtex.py" ]; then
        python3 - << 'PATCH_INKSCAPE'
import re, sys

with open("pretex/processtex.py", "r") as f:
    src = f.read()

# Locate the inkscape_script method by finding its def line
marker = "    def inkscape_script(self):"
if marker not in src:
    print("  inkscape_script not found, skipping patch")
    sys.exit(0)

# Find where this method starts and where the next method/class ends
start = src.find(marker)
# Look for: next class-level method OR module-level code (dedent to 0 or other class)
after = src[start + len(marker):]
m = re.search(r"\n    def |\n[^\s\n]", after)
if m:
    end = start + len(marker) + m.start() + 1  # +1 for the leading \n
else:
    # inkscape_script is the last method and there is no module-level code after
    end = len(src)

new_method = (
    "    def inkscape_script(self):\n"
    "        \"Convert PDF pages to SVG using the Inkscape 1.x CLI.\"\n"
    "        import os\n"
    "        import subprocess\n"
    "\n"
    "        try:\n"
    "            os.makedirs(self.svg_dir, exist_ok=True)\n"
    "        except Exception:\n"
    "            pass\n"
    "\n"
    "        for page_num in range(self.num_pages):\n"
    "            svg_file = self.svg_file(page_num)\n"
    "            cmd = ['inkscape',\n"
    "                   '--export-filename=' + svg_file,\n"
    "                   '--export-plain-svg']\n"
    "            if self.pages_extents[page_num].get('display'):\n"
    "                cmd.append('--export-area-drawing')\n"
    "            proc = subprocess.run(\n"
    "                cmd + ['--pdf-page=' + str(page_num + 1), self.pdf_file],\n"
    "                stdout=subprocess.PIPE,\n"
    "                stderr=subprocess.PIPE,\n"
    "                timeout=60)\n"
    "            if proc.returncode != 0:\n"
    "                raise RuntimeError(\n"
    "                    'Could not convert {} page {} to svg: {}'.format(\n"
    "                        self.pdf_file,\n"
    "                        page_num + 1,\n"
    "                        proc.stderr.decode('utf-8', 'ignore')))\n"
    "\n"
    "        return ''\n"
    "\n"
)

src = src[:start] + new_method + src[end:]
with open("pretex/processtex.py", "w") as f:
    f.write(src)
print("  \u2713 processtex.py inkscape_script patched for Inkscape 1.x CLI export")
PATCH_INKSCAPE
        echo "    ✓ processtex.py patched for Inkscape 1.x CLI export"
    fi

    # Patch processtex.py write_html: guard svgs[i] access so that if SVG
    # generation fails for some math elements (len(svgs) < len(to_replace))
    # we skip rather than crash with IndexError.
    if [ -f "pretex/processtex.py" ]; then
        python3 - << 'PATCH_WRITE_HTML'
import sys

with open("pretex/processtex.py", "r") as f:
    src = f.read()

# Already patched?
if '_WRITE_HTML_GUARDED' in src:
    print("  write_html already patched")
    sys.exit(0)

old = (
    "        for i, elt in enumerate(self.to_replace):\n"
    "            self._replace_elt(elt, svgs[i])\n"
    "            cached_elts.append(svgs[i])\n"
)
new = (
    "        # _WRITE_HTML_GUARDED\n"
    "        from lxml import html as _lh_mod\n"
    "        for i, elt in enumerate(self.to_replace):\n"
    "            if i >= len(svgs):\n"
    "                # SVG missing: write the original element to cache so\n"
    "                # use_cached_svg gets the right element count on next run.\n"
    "                try:\n"
    "                    ph = _lh_mod.fragment_fromstring('<span class=\"pretex-placeholder\"></span>')\n"
    "                except Exception:\n"
    "                    from lxml import etree as _et; ph = _et.Element('span')\n"
    "                ph.tail = elt.tail\n"
    "                cached_elts.append(ph)\n"
    "                continue\n"
    "            self._replace_elt(elt, svgs[i])\n"
    "            cached_elts.append(svgs[i])\n"
)

if old in src:
    with open("pretex/processtex.py", "w") as f:
        f.write(src.replace(old, new, 1))
    print("  \u2713 processtex.py write_html patched (bounds-safe SVG replacement)")
else:
    print("  write_html pattern not found - patch skipped (may already be different version)")
PATCH_WRITE_HTML
        echo "    ✓ processtex.py write_html patched"
    fi

    # Patch processtex.py use_cached_svg: guard cache[2] access.
    # If a cache was written with 0 SVGs (e.g. from a previous crashed run),
    # len(cache) == 2 so cache[2] throws IndexError.  Skip replacement safely.
    if [ -f "pretex/processtex.py" ]; then
        python3 - << 'PATCH_USE_CACHED'
import sys

with open("pretex/processtex.py", "r") as f:
    src = f.read()

if '_USE_CACHED_GUARDED' in src:
    print("  use_cached_svg already patched")
    sys.exit(0)

old = (
    "        for elt in self.to_replace:\n"
    "            svg = cache[2]\n"
    "            self._replace_elt(elt, svg)\n"
)
new = (
    "        # _USE_CACHED_GUARDED\n"
    "        for elt in self.to_replace:\n"
    "            if len(cache) <= 2:\n"
    "                break  # cache has no SVGs - leave element unreplaced\n"
    "            svg = cache[2]\n"
    "            self._replace_elt(elt, svg)\n"
)

if old in src:
    with open("pretex/processtex.py", "w") as f:
        f.write(src.replace(old, new, 1))
    print("  \u2713 processtex.py use_cached_svg patched (bounds-safe cache read)")
else:
    print("  use_cached_svg pattern not found - may already differ")
PATCH_USE_CACHED
        echo "    ✓ processtex.py use_cached_svg patched"
    fi

    # Patch processtex.py process_image: handle base64 data URIs from Inkscape 1.x.
    # Inkscape 0.9x wrote images as file references in SVG; Inkscape 1.x embeds them
    # as data URIs (data:image/png;base64,...).  The old code tries to open the
    # base64 string as a filename → FileNotFoundError.
    if [ -f "pretex/processtex.py" ]; then
        python3 - << 'PATCH_PROCESS_IMAGE'
import sys

with open("pretex/processtex.py", "r") as f:
    src = f.read()

if '_PROCESS_IMAGE_GUARDED' in src:
    print("  process_image already patched")
    sys.exit(0)

# The method starts with: href = img.attrib['xlink:href']
# We inject a data-URI handler right after the 'del img.attrib[...]' line.
old = (
    "        href = img.attrib['xlink:href']\n"
    "        del img.attrib['xlink:href']\n"
    "        # Inkscape has no idea where the file ended up\n"
    "        fname = os.path.join(self.out_img_dir, os.path.basename(href))\n"
    "        # Cache the image by a hash of its content\n"
    "        with open(fname, 'rb') as fobj:\n"
    "            img_hash = b64_hash(fobj.read())\n"
    "        img_name = img_hash + '.png'\n"
    "        self.images.append(img_name)\n"
    "        img.attrib['href'] = FIGURE_IMG_DIR + '/' + img_name\n"
    "        # Move to the cache directory\n"
    "        move(fname, os.path.join(self.cache_dir, img_name))\n"
)
new = (
    "        # _PROCESS_IMAGE_GUARDED\n"
    "        href = img.attrib['xlink:href']\n"
    "        del img.attrib['xlink:href']\n"
    "        if href.startswith('data:'):\n"
    "            # Inkscape 1.x embeds images as base64 data URIs\n"
    "            try:\n"
    "                import base64 as _b64\n"
    "                _parts = href.split(',', 1)\n"
    "                _img_bytes = _b64.b64decode(_parts[1]) if len(_parts) == 2 else b''\n"
    "            except Exception:\n"
    "                _img_bytes = b''\n"
    "            img_hash = b64_hash(_img_bytes)\n"
    "            img_name = img_hash + '.png'\n"
    "            self.images.append(img_name)\n"
    "            img.attrib['href'] = FIGURE_IMG_DIR + '/' + img_name\n"
    "            _dest = os.path.join(self.cache_dir, img_name)\n"
    "            if not os.path.exists(_dest) and _img_bytes:\n"
    "                with open(_dest, 'wb') as _fobj:\n"
    "                    _fobj.write(_img_bytes)\n"
    "        else:\n"
    "            # Inkscape 0.9x-style file reference\n"
    "            fname = os.path.join(self.out_img_dir, os.path.basename(href))\n"
    "            # Cache the image by a hash of its content\n"
    "            with open(fname, 'rb') as fobj:\n"
    "                img_hash = b64_hash(fobj.read())\n"
    "            img_name = img_hash + '.png'\n"
    "            self.images.append(img_name)\n"
    "            img.attrib['href'] = FIGURE_IMG_DIR + '/' + img_name\n"
    "            # Move to the cache directory\n"
    "            move(fname, os.path.join(self.cache_dir, img_name))\n"
)

if old in src:
    with open("pretex/processtex.py", "w") as f:
        f.write(src.replace(old, new, 1))
    print("  \u2713 processtex.py process_image patched for Inkscape 1.x data URIs")
else:
    print("  process_image pattern not found - patch skipped")
PATCH_PROCESS_IMAGE
        echo "    ✓ processtex.py process_image patched"
    fi

    # Patch processtex.py process_svgs: wrap per-page processing in try/except so
    # that one bad SVG page doesn't abort the entire HTML file's math processing.
    if [ -f "pretex/processtex.py" ]; then
        python3 - << 'PATCH_PROCESS_SVGS'
import sys

with open("pretex/processtex.py", "r") as f:
    src = f.read()

if '_PROCESS_SVGS_GUARDED' in src:
    print("  process_svgs already patched")
    sys.exit(0)

old = (
    "        for page_num, page_extents in enumerate(self.pages_extents):\n"
    "            with open(self.svg_file(page_num), 'rb') as fobj:\n"
    "                svg = html.fromstring(fobj.read())\n"
)
new = (
    "        # _PROCESS_SVGS_GUARDED\n"
    "        for page_num, page_extents in enumerate(self.pages_extents):\n"
    "            try:\n"
    "                with open(self.svg_file(page_num), 'rb') as fobj:\n"
    "                    svg = html.fromstring(fobj.read())\n"
)

# We also need to add a closing except and continue at the end of the
# per-page block.  Find the end of the page loop body by looking for
# the first line at the for-loop indentation level after it starts.
if old not in src:
    print("  process_svgs pattern not found - patch skipped")
    sys.exit(0)

# Replace the open() call and wrap ONLY the per-page block safely.
# The safest minimal change: wrap just the open() + fromstring() in try/except.
src = src.replace(old, new, 1)

# Now insert the except clause right after the fromstring line.
# The next line after fromstring is "            # Remove extra attrs" — find it.
EXCEPT_INSERTION = (
    "            except Exception as _psvg_err:\n"
    "                print('  process_svgs: skipping page {} - {}'.format(page_num, _psvg_err))\n"
    "                continue\n"
)
# Insert before '            # Remove extra attrs from <svg>'
target = "            # Remove extra attrs from <svg>\n"
if target in src:
    src = src.replace(target, EXCEPT_INSERTION + target, 1)
    with open("pretex/processtex.py", "w") as f:
        f.write(src)
    print("  \u2713 processtex.py process_svgs patched (per-page exception guard)")
else:
    # Revert and skip
    with open("pretex/processtex.py", "w") as f:
        f.write(src)
    print("  process_svgs: could not find insertion point for except clause")
PATCH_PROCESS_SVGS
        echo "    ✓ processtex.py process_svgs patched"
    fi
fi

# Fix Python 3 incompatibility in demos/SConscript coffee_filter
# The coffee_filter uses universal_newlines=True but then passes bytes to communicate()
# Fix: remove universal_newlines=True so stdin/stdout stay in bytes mode
if [ -f "demos/SConscript" ]; then
    sed -i 's/stdin=PIPE, stdout=PIPE, universal_newlines=True/stdin=PIPE, stdout=PIPE/' demos/SConscript 2>/dev/null || true
    echo "  ✓ demos/SConscript coffee_filter patched for Python 3"

    # Patch version_filter to gracefully handle missing files.
    # If git hash-object fails (file not found), return a stable fallback hash.
    python3 - << 'PATCH_VERSION_FILTER'
with open('demos/SConscript', 'r') as f:
    src = f.read()
old = "        commit = check_output(\n            ['git', 'hash-object', fname2])\n        vers = commit.decode()[:6]"
new = (
    "        try:\n"
    "            commit = check_output(\n"
    "                ['git', 'hash-object', fname2])\n"
    "            vers = commit.decode()[:6]\n"
    "        except Exception:\n"
    "            vers = 'static'"
)
if old in src and 'except Exception' not in src:
    with open('demos/SConscript', 'w') as f:
        f.write(src.replace(old, new))
    print("  \u2713 demos/SConscript version_filter patched to handle missing files")
else:
    print("  version_filter patch not needed or already applied")
PATCH_VERSION_FILTER
fi

echo ""
echo "=== Step 5: Detecting and running build system ==="

BUILD_SUCCESS=false

if [ -f "SConstruct" ]; then
    echo "✓ Found SConstruct - running scons..."

    # Start virtual framebuffer for headless X11 (needed by fontforge and inkscape)
    if command -v Xvfb &> /dev/null && [ -z "${DISPLAY:-}" ]; then
        Xvfb :99 -screen 0 1024x768x24 -nolisten tcp &
        XVFB_PID=$!
        export DISPLAY=:99
        sleep 1
        echo "  ✓ Started Xvfb on :99 (PID $XVFB_PID)"
    fi

    echo "Setting up build directories..."
    # NOTE: Do NOT delete .sconsign.dblite — it's SCons's incremental build database.
    # Deleting it forces a full rebuild every time. Keep it so SCons skips unchanged files.
    mkdir -p /home/vagrant/build/js /home/vagrant/build/css /home/vagrant/build/figure-images /home/vagrant/build/knowl /home/vagrant/build/demos
    mkdir -p /home/vagrant/cache/css /home/vagrant/cache/pretex-cache
    
    mkdir -p mathbook-assets/build mathbook/css mathbook/build static/css static/js vendor
    [ ! -f "mathbook/css/mathbook-add-on" ] && echo "/* placeholder */" > mathbook/css/mathbook-add-on
    [ ! -f "static/css/ila-add-on" ] && echo "/* placeholder */" > static/css/ila-add-on
    [ ! -f "static/css/ila-add-on-gt" ] && echo "/* placeholder */" > static/css/ila-add-on-gt
    [ ! -f "mathbook/build/pretext.rng" ] && echo '<?xml version="1.0"?><grammar xmlns="http://relaxng.org/ns/structure/1.0"><start><ref name="any"/></start><define name="any"><element><anyName/><zeroOrMore><choice><attribute><anyName/></attribute><text/><ref name="any"/></choice></zeroOrMore></element></define></grammar>' > mathbook/build/pretext.rng

    # SCons references vendor and static/js files WITHOUT extensions.
    # Copy .js → extensionless and .css → extensionless so scons can find them.
    for jsfile in vendor/*.js; do
        [ -f "$jsfile" ] || continue
        base="${jsfile%.js}"
        [ ! -f "$base" ] && cp "$jsfile" "$base" && echo "  Created extensionless: $base"
    done
    for cssfile in vendor/*.css; do
        [ -f "$cssfile" ] || continue
        base="${cssfile%.css}"
        [ ! -f "$base" ] && cp "$cssfile" "$base" && echo "  Created extensionless: $base"
    done
    for jsfile in static/js/*.js; do
        [ -f "$jsfile" ] || continue
        base="${jsfile%.js}"
        [ ! -f "$base" ] && cp "$jsfile" "$base" && echo "  Created extensionless: $base"
    done
    # Hard-coded fallbacks for the four files ila.js needs, in case they're absent from the repo
    [ ! -f "vendor/knowl" ]      && echo "// knowl placeholder"      > vendor/knowl
    [ ! -f "vendor/knowlstyle" ] && echo "/* knowlstyle placeholder */" > vendor/knowlstyle
    [ ! -f "static/js/Mathbook" ] && echo "// Mathbook placeholder" > static/js/Mathbook
    
    [ ! -f "/home/vagrant/build/css/ila.css" ] && echo "/* ILA CSS placeholder */" > /home/vagrant/build/css/ila.css
    [ ! -f "/home/vagrant/build/js/ila.js" ] && echo "// ILA JS placeholder" > /home/vagrant/build/js/ila.js
    
    echo "Step 5a: Building with default target ($(nproc) parallel jobs)..."
    scons -j$(nproc) 2>&1 || echo "⚠️  scons default had warnings"
    
    if [ ! -f "/home/vagrant/build/js/ila.js" ] || [ $(stat -c%s "/home/vagrant/build/js/ila.js" 2>/dev/null || echo 0) -lt 200 ]; then
        echo "  Creating ila.js placeholder..."
        mkdir -p /home/vagrant/build/js
        echo "// ILA.js placeholder\nconsole.log('ILA loaded');\nwindow.ILA = window.ILA || {};" > /home/vagrant/build/js/ila.js
    fi

    if [ -f "/home/vagrant/cache/css/ila.css" ] && [ $(stat -c%s "/home/vagrant/build/css/ila.css" 2>/dev/null || echo 0) -lt 1000 ]; then
        echo "  Restoring bundled ila.css from cache..."
        cp /home/vagrant/cache/css/ila.css /home/vagrant/build/css/ila.css
    fi

    if [ -f "/home/vagrant/cache/js/ila.js" ] && [ $(stat -c%s "/home/vagrant/build/js/ila.js" 2>/dev/null || echo 0) -lt 200 ]; then
        echo "  Restoring bundled ila.js from cache..."
        cp /home/vagrant/cache/js/ila.js /home/vagrant/build/js/ila.js
    fi
    
    mkdir -p /home/vagrant/output-html /home/vagrant/cache /repo/html
    
    # Ensure pretex-cache has at least one PNG file to prevent
    # the 'cp *.png' post-action in src/SConscript from failing when
    # no LaTeX equations reference external image files.
    mkdir -p /home/vagrant/cache/pretex-cache
    if [ -z "$(ls /home/vagrant/cache/pretex-cache/*.png 2>/dev/null)" ]; then
        python3 -c "
from PIL import Image
img = Image.new('RGBA', (1, 1), (0, 0, 0, 0))
img.save('/home/vagrant/cache/pretex-cache/placeholder.png')
" 2>/dev/null || python3 -c "
import struct, zlib
def _chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
png = b'\x89PNG\r\n\x1a\n'
png += _chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0))
png += _chunk(b'IDAT', zlib.compress(b'\x00\x00\x00\x00\x00'))
png += _chunk(b'IEND', b'')
open('/home/vagrant/cache/pretex-cache/placeholder.png', 'wb').write(png)
"
        echo "  Created placeholder PNG in pretex-cache"
    fi

    if [ "${BUILD_PDF:-}" = "1" ]; then
        echo "Step 5b: Building PDF via scons print ($(nproc) parallel jobs)..."
        scons print -j$(nproc) 2>&1 || true

        # Locate the generated PDF
        PDF_FILE=$(find /home/vagrant /repo -name "*.pdf" -type f 2>/dev/null | head -1)
        if [ -n "$PDF_FILE" ]; then
            echo "✓ PDF found: $PDF_FILE"
            mkdir -p /output
            cp "$PDF_FILE" /output/textbook.pdf
            BUILD_SUCCESS=true
        else
            echo "⚠️  scons print produced no PDF — aborting PDF build"
        fi
    else
        echo "Step 5b: Building HTML ($(nproc) parallel jobs)..."
        if [ -n "${SECTION_XMLID:-}" ]; then
            echo "  Per-section build targeting xmlid: ${SECTION_XMLID}"
            if scons "html/${SECTION_XMLID}.html" -j$(nproc) 2>&1; then
                echo "  ✓ Per-section SCons build succeeded"
            else
                echo "  ⚠️  Per-section build failed — falling back to full HTML build"
                scons html -j$(nproc) 2>&1 || true
            fi
        else
            scons html -j$(nproc) 2>&1 || true
        fi

        HTML_COUNT=$(find /home/vagrant -name "*.html" -type f 2>/dev/null | wc -l)
        REPO_HTML_COUNT=$(find /repo/html -name "*.html" -type f 2>/dev/null | wc -l)
        TOTAL_HTML=$((HTML_COUNT + REPO_HTML_COUNT))

        echo "  Found $TOTAL_HTML HTML files in build directories"

        if [ "$TOTAL_HTML" -gt 10 ]; then
            echo "✓ HTML generation succeeded ($TOTAL_HTML files)"
            BUILD_SUCCESS=true

            if [ -f "/home/vagrant/cache/css/ila.css" ] && [ $(stat -c%s "/home/vagrant/build/css/ila.css" 2>/dev/null || echo 0) -lt 1000 ]; then
                echo "  Refreshing bundled ila.css from cache before export..."
                cp /home/vagrant/cache/css/ila.css /home/vagrant/build/css/ila.css
            fi

            if [ -f "/home/vagrant/cache/js/ila.js" ] && [ $(stat -c%s "/home/vagrant/build/js/ila.js" 2>/dev/null || echo 0) -lt 200 ]; then
                echo "  Refreshing bundled ila.js from cache before export..."
                cp /home/vagrant/cache/js/ila.js /home/vagrant/build/js/ila.js
            fi

            echo "  Copying generated files to /output..."
            [ -e /output ] && [ ! -d /output ] && rm -f /output
            mkdir -p /output 2>/dev/null || true
            [ -d "/home/vagrant/build" ] && cp -r /home/vagrant/build/* /output/ 2>/dev/null
            [ -d "/home/vagrant/cache" ] && cp -r /home/vagrant/cache/* /output/ 2>/dev/null
            [ -d "/home/vagrant/output-html" ] && cp -r /home/vagrant/output-html/* /output/ 2>/dev/null
            [ -d "/repo/html" ] && cp -r /repo/html/* /output/ 2>/dev/null
        fi
    fi
    
elif [ -f "project.ptx" ]; then
    echo "✓ Found project.ptx - running pretext..."
    
    for dir in output/web output/html output/web-pdf output/print output/runestone; do
        if [ -d "$dir" ] && [ -n "$(find $dir -name '*.html' 2>/dev/null | head -1)" ]; then
            echo "✓ Found pre-built output in $dir"
            cp -r $dir/* /output/ 2>/dev/null
            BUILD_SUCCESS=true
            break
        fi
    done
    
    if [ "$BUILD_SUCCESS" != "true" ]; then
        if [ "${BUILD_PDF:-}" = "1" ]; then
            echo "  Trying: pretext build print"
            pretext build print -a 2>&1 || pretext build print 2>&1 || true
            PDF_FILE=$(find output/print -name "*.pdf" -type f 2>/dev/null | head -1)
            if [ -n "$PDF_FILE" ]; then
                echo "✓ pretext build print produced: $PDF_FILE"
                mkdir -p /output
                cp "$PDF_FILE" /output/textbook.pdf
                BUILD_SUCCESS=true
            fi
        else
            for target in web html runestone print; do
                echo "  Trying: pretext build $target"
                pretext build $target -a 2>&1 || pretext build $target 2>&1 || true

                if [ -d "output/$target" ] && [ -n "$(find output/$target -name '*.html' 2>/dev/null | head -1)" ]; then
                    echo "✓ pretext build $target produced HTML output"
                    BUILD_SUCCESS=true
                    cp -r output/$target/* /output/ 2>/dev/null
                    break
                fi
            done
        fi
    fi
    
elif [ -f "Makefile" ]; then
    echo "✓ Found Makefile - running make..."
    make html 2>&1 || make 2>&1 || true
    BUILD_SUCCESS=true
fi

echo ""
echo "=== Step 6: Copying output ==="

if [ "${BUILD_PDF:-}" = "1" ]; then
    # PDF build — output was already written to /output/textbook.pdf above; nothing more to copy.
    echo "  PDF mode: skipping HTML asset copy"
else
    [ -e /output ] && [ ! -d /output ] && rm -f /output
    mkdir -p /output 2>/dev/null || true

    [ -d "/home/vagrant/build" ] && cp -r /home/vagrant/build/* /output/ 2>/dev/null && echo "  Copied /home/vagrant/build"
    [ -d "/home/vagrant/cache" ] && cp -r /home/vagrant/cache/* /output/ 2>/dev/null && echo "  Copied /home/vagrant/cache"
    [ -d "/home/vagrant/output-html" ] && cp -r /home/vagrant/output-html/* /output/ 2>/dev/null && echo "  Copied /home/vagrant/output-html"
    [ -d "/repo/html" ] && cp -r /repo/html/* /output/ 2>/dev/null && echo "  Copied /repo/html"

    for dir in "build/html" "build" "html" "static" "output" "_build/html" "dist" "public"; do
        [ -d "/repo/$dir" ] && cp -r "/repo/$dir"/* /output/ 2>/dev/null && echo "  Copied /repo/$dir"
    done

    for asset_dir in "mathbook-assets" "css" "js" "images" "fonts" "static" "demos"; do
        if [ -d "/repo/$asset_dir" ]; then
            mkdir -p "/output/$asset_dir"
            rsync -a --exclude='node_modules' "/repo/$asset_dir/" "/output/$asset_dir/" 2>/dev/null || \
                cp -r "/repo/$asset_dir"/* "/output/$asset_dir/" 2>/dev/null
            echo "  Copied asset: $asset_dir"
        fi
    done

    if [ -d "/repo/mathbox" ]; then
        mkdir -p "/output/mathbox"
        rsync -a --exclude='node_modules' "/repo/mathbox/" "/output/mathbox/" 2>/dev/null || true
        echo "  Copied asset: mathbox"
    fi
fi

echo ""
echo "=== Step 7: Finding entry point ==="

ENTRY_FILE=""

for candidate in "overview.html" "index.html" "toc.html" "home.html"; do
    if [ -f "/output/$candidate" ]; then
        ENTRY_FILE="$candidate"
        echo "✓ Found entry point: $ENTRY_FILE"
        break
    fi
done

if [ -z "$ENTRY_FILE" ]; then
    for candidate in "web/index.html" "web4/index.html" "html/index.html"; do
        if [ -f "/output/$candidate" ]; then
            ENTRY_FILE="$candidate"
            echo "✓ Found entry point: $ENTRY_FILE"
            break
        fi
    done
fi

HTML_COUNT=$(find /output -name "*.html" -type f 2>/dev/null | wc -l)

if [ "$HTML_COUNT" -gt 1 ]; then
    echo "✓ Build produced $HTML_COUNT HTML files"
fi

echo ""
echo "=== Build Complete ==="
echo "Entry point: $ENTRY_FILE"
echo "Total files in /output:"
find /output -type f 2>/dev/null | wc -l

if [ "$HTML_COUNT" -gt 1 ]; then
    echo ""
    echo "✅ BUILD SUCCESSFUL - $HTML_COUNT HTML files generated"
    exit 0
else
    echo ""
    echo "❌ BUILD FAILED - No HTML output generated"
    exit 1
fi
