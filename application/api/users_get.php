<?php
/**
 * GET /api/users_get.php?handle=MarioBros
 * Retorna o perfil público de um usuário. Requer login.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('GET');
require_login();

$handle = trim((string)($_GET['handle'] ?? ''));
$handle = ltrim($handle, '@');
if ($handle === '') json_err('Handle ausente.', 400, 'ERR_HANDLE');

$stmt = db()->prepare(
   'SELECT id, username, nome_display, sobre, foto_perfil, foto_banner, cidade, estado
    FROM usuarios WHERE LOWER(username) = LOWER(?) AND deleted_at IS NULL LIMIT 1'
);
$stmt->execute([$handle]);
$user = $stmt->fetch();

if (!$user) json_err('Usuário não encontrado.', 404, 'ERR_USER_NOT_FOUND');

$user['id'] = (int)$user['id'];
json_ok($user);
