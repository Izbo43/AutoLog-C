<?php
/**
 * AutoLog — Configuração do Banco de Dados
 *
 * 1) Copie este arquivo para "config.php" (mesma pasta).
 * 2) Ajuste as credenciais conforme seu ambiente (XAMPP, LAMP, etc).
 * 3) NUNCA versione o config.php real — adicione-o ao .gitignore.
 */

return [
    'db' => [
        'host'    => getenv('DB_HOST') ?: '127.0.0.1',
        'port'    => (int) (getenv('DB_PORT') ?: 3306),
        'name'    => getenv('DB_NAME') ?: 'autolog',
        'user'    => getenv('DB_USER') ?: 'root',
        'pass'    => getenv('DB_PASS') ?: '',                  // XAMPP padrao = vazio
        'charset' => 'utf8mb4',
    ],

    // Tempo de sessão em segundos (1 dia)
    'session_lifetime' => 86400,

    // Em produção, defina como TRUE (servir via HTTPS)
    'cookie_secure' => false,
];
