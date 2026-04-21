Source = require '../base/source'
Util   = require '../../../util'

class Image extends Source
    @traits = ['node', 'source', 'index', 'texture', 'image', 'rawtex']

    init: () ->
        @width = @height = @texture = @uniforms = null
        @myTexture = false

    sourceShader: (shader) ->
        shader.pipe
        shader.pipe Util.GLSL.truncateVec 4, 2
        shader.pipe 'map.2d.data', @uniforms
        shader.pipe 'sample.2d', @uniforms

    imageShader: (shader) ->
        shader.pipe 'sample.2d', @uniforms

    getDimensions: () ->
        items:  1
        width:  @width
        height: @height
        depth:  1

    make: () ->
        types = @_attributes.types
        @uniforms =
            dataTexture:    { type: 't', value: null }
            dataResolution: @_attributes.make types.vec2()
            dataPointer:    @_attributes.make types.vec2()

    unmake: () ->
        if @myTexture
            @texture.dispose()
        @width = @height = @texture = null
        delete @uniforms
        @myTexture = false

    change: (changed, touched, init) ->
        if init
            return @updateTex()
        width  = @props.width  ? @props.image?.naturalWidth  ? 1
        height = @props.height ? @props.image?.naturalHeight ? 1
        return @rebuild() if @width != width or @height != height
        if touched['image']
            @updateTex()

    updateTex: () ->
        @width  = @props.width  ? @props.image?.naturalWidth  ? 1
        @height = @props.height ? @props.image?.naturalHeight ? 1
        image   = @props.image
        texture = @props.texture
        @needFlip = false;

        minFilter = @props.minFilter ? THREE.LinearFilter
        magFilter = @props.magFilter ? THREE.LinearFilter

        if @myTexture
            @texture.dispose()
            @myTexture = false

        if not texture? and not image?
            # Use default (black) texture -- for waiting for an image to load
            texture = new THREE.DataTexture \
                new Uint8Array(@width * @height * 4),
                @width,
                @height,
                THREE.RGBAFormat,
                THREE.FloatType,
                THREE.UVMapping,
                THREE.ClampToEdgeWrapping,
                THREE.ClampToEdgeWrapping,
                magFilter,
                minFilter,
                1                               # anisotropy
            texture.generateMipmaps = false
            texture.flipY           = false
            texture.needsUpdate     = true
            @myTexture = true

        if image?
            texture = new THREE.Texture  \
                image,
                THREE.UVMapping,
                THREE.ClampToEdgeWrapping, # Needed for non-power-of-two textures
                THREE.ClampToEdgeWrapping, # Needed for non-power-of-two textures
                magFilter,
                minFilter,
                THREE.RGBAFormat,
                THREE.FloatType
            texture.generateMipmaps = false # Needed for non-power-of-two textures
            texture.unpackAlignment = 1
            texture.flipY           = false
            texture.needsUpdate     = true
            @myTexture = true
            @needFlip = true;

        @texture = texture
        # Image is y-flipped.  The texture.flipY parameter does not behave as
        # expected in MathBox, because it will flip *all* subsequent texture
        # loads, including data textures.  Hence the flip happens in
        # map.2d.data, with the funny dataResolution and dataPointer uniforms.
        @uniforms.dataTexture.value = @texture
        if @needFlip
            @uniforms.dataResolution.value.set 1/@width, -1/@height
            @uniforms.dataPointer.value.set 0.5, -@height+0.5
        else
            @uniforms.dataResolution.value.set 1/@width, 1/@height
            @uniforms.dataPointer.value.set 0.5, 0.5


module.exports = Image
