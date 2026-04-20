FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=18
ENV PATH="/usr/local/bin:$PATH"

# Layer 1: TeX Live (largest download, rarely changes — keep in own layer for cache efficiency).
RUN apt-get update && apt-get install -y texlive-full \
    && rm -rf /var/lib/apt/lists/*

# Layer 2: All other system dependencies.
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    python3 \
    python3-pip \
    python3-venv \
    fontforge \
    python3-fontforge \
    python3-lxml \
    python3-cairo \
    xsltproc \
    libxml2-utils \
    openjdk-11-jre-headless \
    ruby-full \
    build-essential \
    libcairo2-dev \
    pkg-config \
    python3-gi \
    python3-gi-cairo \
    gir1.2-gtk-3.0 \
    libgirepository1.0-dev \
    librsvg2-bin \
    poppler-utils \
    libpoppler-dev \
    libpoppler-cpp-dev \
    libpoppler-glib-dev \
    gir1.2-poppler-0.18 \
    imagemagick \
    ghostscript \
    scons \
    inotify-tools \
    inkscape \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18 for mathbox/gulp.
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Ruby gems - use sass-embedded instead of compass (Ruby 3.2 compatible).
RUN gem install sass-embedded

# Install global npm packages - use coffee-script 1.x (not coffeescript 2.x).
RUN npm install -g \
    gulp-cli \
    gulp@3.9.1 \
    bower \
    uglify-js \
    clean-css-cli \
    browserify \
    coffee-script@1.12.7

# Verify and create symlinks for coffee command.
RUN ln -sf $(npm root -g)/coffee-script/bin/coffee /usr/local/bin/coffee && \
    ln -sf $(npm root -g)/coffee-script/bin/cake /usr/local/bin/cake && \
    ln -sf /usr/local/bin/coffee /usr/bin/coffee && \
    coffee --version

# Install Python packages (including python-poppler for pretex math image generation).
RUN pip3 install --break-system-packages \
    lxml \
    mako \
    pycairo \
    Pillow \
    PyPDF2 \
    pygments \
    pdfrw \
    python-poppler

# Create working directories.
RUN mkdir -p /repo /output /home/vagrant/build /home/vagrant/cache /home/vagrant/output-html

# Allow bower to run as root.
RUN echo '{ "allow_root": true }' > /root/.bowerrc

# Allow PDF operations in ImageMagick.
RUN if [ -f /etc/ImageMagick-6/policy.xml ]; then \
        sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' /etc/ImageMagick-6/policy.xml; \
    fi

WORKDIR /repo

COPY build.sh /build.sh
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /build.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["build", "/repo", "/output"]
