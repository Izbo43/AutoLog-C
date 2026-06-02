<?php
/**
 * GET /api/auth_me_full.php
 * Retorna TODOS os campos editáveis do próprio usuário logado.
 * Usado para pré-popular o formulário de edição.
 * NUNCA expõe a senha (apenas o hash internamente — descartado na resposta).
 */
require __DIR__ . '/_bootstrap.php';
require __DIR__ . '/db.php';

require_method('GET');
$id = require_login();

$stmt = db()->prepare(
   'SELECT id, username, nome_display, nome_completo, email,
           cpf_cnpj, telefone, telefone2,
           DATE_FORMAT(data_nasc, "%d/%m/%Y") AS data_nasc,
           sobre, foto_perfil, foto_banner,
           cep, rua, numero, bairro, cidade, estado
    FROM usuarios
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1'
);
$stmt->execute([$id]);
$user = $stmt->fetch();

if (!$user) {
    session_destroy();
    json_err('Sessão inválida.', 401, 'ERR_INVALID_SESSION');
}

$user['id'] = (int)$user['id'];
json_ok($user);
