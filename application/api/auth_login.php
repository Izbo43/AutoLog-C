<?php
/**
 * POST /api/auth_login.php
 * Body JSON: { email, senha }
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('POST');

$in    = read_json_body();
$email = strtolower(s($in['email'] ?? '', 150));
$senha = (string)($in['senha'] ?? '');

if ($email === '' || $senha === '') {
    json_err('Preencha email e senha.', 400, 'ERR_FIELDS');
}

$stmt = db()->prepare('SELECT id, username, senha_hash FROM usuarios WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($senha, $user['senha_hash'])) {
    // mesma mensagem para email errado e senha errada (evita enumeração)
    json_err('Email ou senha incorretos.', 401, 'ERR_AUTH');
}

session_regenerate_id(true);
$_SESSION['user_id']  = (int)$user['id'];
$_SESSION['username'] = $user['username'];

json_ok([
    'id'       => (int)$user['id'],
    'username' => $user['username'],
]);
