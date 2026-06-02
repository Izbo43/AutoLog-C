<?php
/**
 * api/_bootstrap.php
 * Carregado por todos os endpoints. Configura sessão, headers JSON e helpers.
 *
 * Blindagens:
 *  - display_errors desligado (warnings nunca vazam pro frontend)
 *  - output buffer descartado antes de cada json_*
 *  - handlers globais de erro/exceção/shutdown que sempre devolvem JSON
 *  - detecção de POST que estourou post_max_size
 */

declare(strict_types=1);

// ── ERROR HANDLING — garante que NADA vaza fora do JSON ────────
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

ob_start();   // captura qualquer echo/warning acidental

set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) return false;
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(function (Throwable $e) {
    if (ob_get_length() !== false) @ob_clean();
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode([
        'ok'    => false,
        'error' => 'Erro interno no servidor.',
        'code'  => 'ERR_INTERNAL',
        'detail'=> $e->getMessage(),   // remover em produção
    ], JSON_UNESCAPED_UNICODE);
    exit;
});

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (ob_get_length() !== false) @ob_clean();
        if (!headers_sent()) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'ok'    => false,
            'error' => 'Erro fatal no servidor.',
            'code'  => 'ERR_FATAL',
            'detail'=> $err['message'],
        ], JSON_UNESCAPED_UNICODE);
    }
});


// ── CARREGAR CONFIG ────────────────────────────────────────────
$cfgPath = __DIR__ . '/../config.php';
if (!file_exists($cfgPath)) {
    if (ob_get_length() !== false) @ob_clean();
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok'    => false,
        'error' => 'Arquivo config.php não encontrado em application/config.php. Crie/ajuste este arquivo e tente novamente.',
        'code'  => 'ERR_NO_CONFIG'
    ]);
    exit;
}
$CONFIG = require $cfgPath;

// ── HEADERS ────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// ── SESSÃO ─────────────────────────────────────────────────────
session_set_cookie_params([
    'lifetime' => $CONFIG['session_lifetime'] ?? 86400,
    'path'     => '/',
    'secure'   => (bool)($CONFIG['cookie_secure'] ?? false),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_name('AUTOLOG_SESSION');
if (session_status() === PHP_SESSION_NONE) session_start();


// ── DETECTA POST QUE ESTOUROU post_max_size ────────────────────
// Quando isso acontece, $_POST/php://input ficam vazios mesmo com CONTENT_LENGTH > 0.
if ($_SERVER['REQUEST_METHOD'] === 'POST'
    && empty($_POST) && empty($_FILES)
    && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0
    && file_get_contents('php://input') === '') {
    if (ob_get_length() !== false) @ob_clean();
    http_response_code(413);
    echo json_encode([
        'ok'    => false,
        'error' => 'Arquivo muito grande. Reduza o tamanho das imagens e tente novamente.',
        'code'  => 'ERR_PAYLOAD_TOO_LARGE',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}


// ── RESPOSTAS ──────────────────────────────────────────────────
function json_ok(array $data = [], int $status = 200): void {
    if (ob_get_length() !== false) @ob_clean();
    http_response_code($status);
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function json_err(string $msg, int $status = 400, string $code = 'ERR_BAD_REQUEST'): void {
    if (ob_get_length() !== false) @ob_clean();
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $msg, 'code' => $code], JSON_UNESCAPED_UNICODE);
    exit;
}


// ── INPUT ──────────────────────────────────────────────────────
function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if (!$raw) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function require_method(string $method): void {
    if ($_SERVER['REQUEST_METHOD'] !== strtoupper($method)) {
        json_err('Método não permitido.', 405, 'ERR_METHOD');
    }
}


// ── AUTENTICAÇÃO ───────────────────────────────────────────────
function current_user_id(): ?int {
    return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
}

function require_login(): int {
    $id = current_user_id();
    if (!$id) json_err('Você precisa estar logado.', 401, 'ERR_NOT_LOGGED');
    return $id;
}


// ── VALIDAÇÕES ─────────────────────────────────────────────────
function is_valid_username(string $u): bool {
    return (bool)preg_match('/^[a-zA-Z0-9_.]{3,30}$/', $u);
}

function is_strong_password(string $p): bool {
    return strlen($p) >= 8
        && preg_match('/[A-Z]/', $p)
        && preg_match('/\d/', $p)
        && preg_match('/[@#$!%&*?\-_.+]/', $p);
}

function is_valid_cpf(string $cpf): bool {
    $cpf = preg_replace('/\D/', '', $cpf);
    if (strlen($cpf) !== 11 || preg_match('/^(\d)\1{10}$/', $cpf)) return false;
    for ($t = 9; $t < 11; $t++) {
        $d = 0;
        for ($c = 0; $c < $t; $c++) $d += (int)$cpf[$c] * (($t + 1) - $c);
        $d = ((10 * $d) % 11) % 10;
        if ((int)$cpf[$c] !== $d) return false;
    }
    return true;
}

function is_valid_cnpj(string $cnpj): bool {
    $cnpj = preg_replace('/\D/', '', $cnpj);
    if (strlen($cnpj) !== 14 || preg_match('/^(\d)\1{13}$/', $cnpj)) return false;
    $weights1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    $weights2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    $sum1 = 0;
    for ($i = 0; $i < 12; $i++) $sum1 += (int)$cnpj[$i] * $weights1[$i];
    $d1 = ($sum1 % 11 < 2) ? 0 : 11 - ($sum1 % 11);
    if ((int)$cnpj[12] !== $d1) return false;
    $sum2 = 0;
    for ($i = 0; $i < 13; $i++) $sum2 += (int)$cnpj[$i] * $weights2[$i];
    $d2 = ($sum2 % 11 < 2) ? 0 : 11 - ($sum2 % 11);
    return (int)$cnpj[13] === $d2;
}

function is_valid_cpf_or_cnpj(string $v): bool {
    $digits = preg_replace('/\D/', '', $v);
    if (strlen($digits) === 11) return is_valid_cpf($digits);
    if (strlen($digits) === 14) return is_valid_cnpj($digits);
    return false;
}


// ── SANITIZAÇÃO ────────────────────────────────────────────────
function s($v, int $maxLen = 255): string {
    if ($v === null) return '';
    $v = trim((string)$v);
    if (strlen($v) > $maxLen) $v = substr($v, 0, $maxLen);
    return $v;
}

function digits_only($v): string {
    return $v ? preg_replace('/\D/', '', (string)$v) : '';
}
