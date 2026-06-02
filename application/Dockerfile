FROM php:8.1-apache

# Instala apenas a extensao necessaria para conexao MySQL via PDO.
RUN docker-php-ext-install pdo_mysql \
	&& a2enmod rewrite

COPY --chown=www-data:www-data . /var/www/html/

EXPOSE 80
