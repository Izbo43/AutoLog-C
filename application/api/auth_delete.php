<?php
/**
 * POST /api/auth_delete.php
 * Soft delete da conta do próprio usuário logado.
 *
 * Body JSON: { email, senha, confirma: true }
 *   - email + senha são REVALIDADOS contra o usuário logado
 *   - confirma=true exigido (checkbox da segunda etapa)
 *
 * Efeitos (em uma única transação):
 *   - usuarios.deleted_at = NOW()
 *   - todos os carros do usuário recebem deleted_at = NOW()
 *   - sessão encerrada
 *
 * Posts ficam no banco, mas posts_list.php filtra autores deletados
 * no JOIN, então não aparecem para mais ninguém.
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('POST');
$meId = require_login();

$in       = read_json_body();
$email    = strtolower(s($in['email'] ?? '', 150));
$senha    = (string)($in['senha'] ?? '');
$confirma = !empty($in['confirma']);

if (!$confirma) {
    json_err('Confirmação de exclusão ausente.', 400, 'ERR_NOT_CONFIRMED');
}
if ($email === '' || $senha === '') {
    json_err('Email e senha são obrigatórios para confirmar a exclusão.', 400, 'ERR_CREDENTIALS');
}

$pdo = db();

$stmt = $pdo->prepare('SELECT id, email, senha_hash, username
                       FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$meId]);
$me = $stmt->fetch();
if (!$me) json_err('Sessão inválida.', 401, 'ERR_INVALID_SESSION');

// As credenciais informadas devem ser as DO PRÓPRIO usuário logado.
if (strtolower((string)$me['email']) !== $email) {
    json_err('Email não corresponde à conta logada.', 401, 'ERR_EMAIL_MISMATCH');
}
if (!password_verify($senha, (string)$me['senha_hash'])) {
    json_err('Senha incorreta.', 401, 'ERR_PASSWORD_WRONG');
}

// === EXECUÇÃO (em transação) =========================================
try {
    $pdo->beginTransaction();

    $now = date('Y-m-d H:i:s');

    $stmt = $pdo->prepare('UPDATE carros SET deleted_at = ?
                           WHERE usuario_id = ? AND deleted_at IS NULL');
    $stmt->execute([$now, $meId]);
    $deletedCars = $stmt->rowCount();

    $stmt = $pdo->prepare('UPDATE usuarios SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$now, $meId]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $e;
}

// encerra sessão
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();

json_ok([
    'message'      => 'Conta excluída com sucesso.',
    'username'     => $me['username'],
    'deleted_cars' => $deletedCars,
]);
