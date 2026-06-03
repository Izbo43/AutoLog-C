FROM php:8.1-apache

RUN apt-get update \
    && apt-get install -y default-mysql-client --no-install-recommends \
    && docker-php-ext-install pdo_mysql \
    && a2enmod rewrite \
    && sed -i 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --chown=www-data:www-data . /var/www/html/

EXPOSE 80
