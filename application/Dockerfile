FROM php:8.1-apache

# Extensões e dependências
RUN apt-get update \
    && apt-get install -y default-mysql-client --no-install-recommends \
    && docker-php-ext-install pdo_mysql \
    && a2enmod rewrite headers \
    && sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf \
    && echo "ServerName localhost" >> /etc/apache2/apache2.conf \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# PHP customizado — aumenta limites para upload de imagens base64
RUN { \
    echo "post_max_size = 32M"; \
    echo "upload_max_filesize = 32M"; \
    echo "memory_limit = 256M"; \
    echo "max_execution_time = 60"; \
    echo "session.cookie_secure = 0"; \
    echo "session.cookie_httponly = 1"; \
    echo "session.cookie_samesite = Lax"; \
    echo "display_errors = Off"; \
    echo "log_errors = On"; \
} > /usr/local/etc/php/conf.d/autolog.ini

COPY --chown=www-data:www-data . /var/www/html/

EXPOSE 80
