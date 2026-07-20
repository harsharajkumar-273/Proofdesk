# -*- python -*-

import fnmatch
import os

env = Environment()

def gulp_build(target, source, env, for_signature=None):
    actions = []
    if not os.path.isdir('node_modules'):
        actions.append('npm install')
    actions.append('git submodule update')
    actions.append('./node_modules/gulp/bin/gulp.js')
    return actions

env['BUILDERS']['GulpBuild'] = Builder(generator=gulp_build)

matches = []
for root, dirnames, filenames in os.walk('src'):
    for filename in fnmatch.filter(filenames, '*.coffee'):
        matches.append(os.path.join(root, filename))
    for filename in fnmatch.filter(filenames, '*.css'):
        matches.append(os.path.join(root, filename))
    for filename in fnmatch.filter(filenames, '*.js'):
        matches.append(os.path.join(root, filename))

env.GulpBuild(Split('''
    build/mathbox-bundle.js
    build/mathbox-bundle.min.js
    build/mathbox-core.js
    build/mathbox-core.min.js
    build/mathbox.css
    build/shaders.js
    '''), matches)

