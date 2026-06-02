<?php
/**
 * api/db.php
 * Singleton de conexão PDO.
 * Use:  $pdo = db();
 */

declare(strict_types=1);

function db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    global $CONFIG;
    if (!is_array($CONFIG)) {
        $CONFIG = require __DIR__ . '/../config.php';
    }

    $c = $CONFIG['db'];
    $dsn = "mysql:host={$c['host']};port={$c['port']};dbname={$c['name']};charset={$c['charset']}";

    try {
        $pdo = new PDO($dsn, $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode([
            'ok'    => false,
            'error' => 'Falha de conexão com o banco de dados.',
            'code'  => 'ERR_DB_CONNECT',
            'detail'=> $e->getMessage(),  // remover em produção
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    return $pdo;
}
