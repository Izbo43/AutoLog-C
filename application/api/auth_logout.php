<?php
/**
 * POST /api/auth_logout.php
 */
require __DIR__ . '/_bootstrap.php';

require_method('POST');

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();

json_ok(['message' => 'Sessão encerrada.']);
