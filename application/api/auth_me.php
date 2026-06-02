<?php
/**
 * GET /api/auth_me.php
 * Devolve dados do usuário logado, ou 200 + data:null se anônimo.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('GET');

$id = current_user_id();
if (!$id) { echo json_encode(['ok' => true, 'data' => null]); exit; }

$stmt = db()->prepare('SELECT id, username, nome_display, sobre, foto_perfil, foto_banner,
                              cidade, estado
                       FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$id]);
$user = $stmt->fetch();

if (!$user) {
    // sessão órfã — usuário foi deletado
    session_destroy();
    echo json_encode(['ok' => true, 'data' => null]);
    exit;
}

$user['id'] = (int)$user['id'];
json_ok($user);
