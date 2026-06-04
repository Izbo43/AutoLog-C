<?php
/**
 * AutoLog — Configuração
 * Lê credenciais das variáveis de ambiente injectadas pelo KaizenOps.
 */

return [
    'db' => [
        'host'    => getenv('DB_HOST') ?: '127.0.0.1',
        'port'    => (int)(getenv('DB_PORT') ?: 3306),
        'name'    => getenv('DB_NAME') ?: 'autolog',
        'user'    => getenv('DB_USER') ?: 'root',
        'pass'    => getenv('DB_PASS') ?: '',
        'charset' => 'utf8mb4',
    ],

    // Tempo de sessão em segundos (1 dia)
    'session_lifetime' => 86400,

    // Detecta HTTPS automaticamente para não quebrar sessões em produção
    'cookie_secure' => (
        (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
    ),
];
